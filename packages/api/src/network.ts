import {
    ExtensionError,
    extensionManifestSchema,
    networkRequestSchema,
    parseResult,
    messageBytes,
    maxRequestBytes,
    type ExtensionManifest,
    type ExtensionArguments,
    type ExtensionResults,
    type NetworkEndpoint,
} from "./contracts";

export type NetworkApproval = {
    endpoint: NetworkEndpoint;
    url: string;
    method: "GET" | "POST";
    query: ExtensionArguments["network.request"]["query"];
    body?: ExtensionArguments["network.request"]["body"];
};

const sent = new Map<string, number[]>();
function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason);
        if (signal.aborted) {
            abort();
            return;
        }
        signal.addEventListener("abort", abort, { once: true });
        operation.then(
            (value) => {
                signal.removeEventListener("abort", abort);
                resolve(value);
            },
            (error) => {
                signal.removeEventListener("abort", abort);
                reject(error);
            }
        );
    });
}

export function createNetworkHandler(
    manifest: ExtensionManifest,
    options: {
        approve(request: NetworkApproval, signal: AbortSignal): Promise<boolean>;
        fetch?: typeof fetch;
    }
) {
    const endpoints = extensionManifestSchema.parse(structuredClone(manifest)).network;
    return async (
        input: ExtensionArguments["network.request"],
        lifetime: AbortSignal
    ): Promise<ExtensionResults["network.request"]> => {
        const parsed = networkRequestSchema.safeParse(input);
        if (!parsed.success) throw new ExtensionError("The API request is invalid.", "invalid");
        const request = parsed.data;
        if (messageBytes(request) > maxRequestBytes)
            throw new ExtensionError("The API request exceeds its size limit.", "invalid");
        const endpoint = endpoints.find((entry) => entry.id === request.endpoint);
        if (!endpoint || !endpoint.methods.includes(request.method))
            throw new ExtensionError("This API endpoint or method is not approved.", "denied");
        const url = new URL(request.path, endpoint.url);
        for (const [key, value] of Object.entries(request.query)) url.searchParams.set(key, value);
        const deadline = new AbortController();
        const signal = AbortSignal.any([lifetime, deadline.signal]);
        const approvalTimer = setTimeout(
            () => deadline.abort(new ExtensionError("API request approval timed out.", "timeout")),
            60_000
        );
        let networkTimer: ReturnType<typeof setTimeout> | undefined;
        try {
            signal.throwIfAborted();
            const allowed = await abortable(
                options.approve(
                    structuredClone({
                        endpoint: structuredClone(endpoint),
                        url: url.href,
                        method: request.method,
                        query: request.query,
                        ...(request.body !== undefined ? { body: request.body } : {}),
                    }),
                    signal
                ),
                signal
            );
            signal.throwIfAborted();
            clearTimeout(approvalTimer);
            if (!allowed) throw new ExtensionError("The API request was cancelled.", "denied");
            if (!options.fetch && typeof window === "undefined")
                throw new ExtensionError(
                    "This host needs a server-safe API transport.",
                    "unavailable"
                );
            const now = Date.now();
            for (const [origin, times] of sent)
                if (times.every((time) => now - time >= 1000)) sent.delete(origin);
            const times = sent.get(url.origin) ?? [];
            const recent = times.filter((time) => now - time < 1000);
            if (recent.length >= 5)
                throw new ExtensionError(
                    "This API is receiving too many requests. Try again shortly.",
                    "rate-limited"
                );
            sent.set(url.origin, [...recent, now]);
            networkTimer = setTimeout(
                () =>
                    deadline.abort(
                        new ExtensionError("The external API request timed out.", "timeout")
                    ),
                10_000
            );
            const response = await abortable(
                (options.fetch ?? fetch)(url.href, {
                    method: request.method,
                    credentials: "omit",
                    redirect: "error",
                    referrerPolicy: "no-referrer",
                    cache: "no-store",
                    headers:
                        request.body === undefined
                            ? { Accept: "application/json" }
                            : { Accept: "application/json", "Content-Type": "application/json" },
                    ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
                    signal,
                }),
                signal
            );
            signal.throwIfAborted();
            if (!response.ok)
                throw new ExtensionError(
                    `External API returned HTTP ${response.status}.`,
                    response.status === 429 ? "rate-limited" : "unavailable"
                );
            if (
                !/^(?:application\/json|[^;]+\+json)(?:;|$)/i.test(
                    response.headers.get("content-type") ?? ""
                )
            )
                throw new ExtensionError("The external API must return JSON.", "invalid");
            if (!response.body)
                throw new ExtensionError("The external API returned no data.", "invalid");
            const reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let bytes = 0;
            try {
                while (true) {
                    const chunk = await abortable(reader.read(), signal);
                    signal.throwIfAborted();
                    if (chunk.done) break;
                    bytes += chunk.value.byteLength;
                    if (bytes > 131072)
                        throw new ExtensionError(
                            "The external API response exceeds 128 KiB.",
                            "invalid"
                        );
                    chunks.push(chunk.value);
                }
            } finally {
                try {
                    await abortable(reader.cancel(), signal);
                } finally {
                    reader.releaseLock();
                }
            }
            const buffer = new Uint8Array(bytes);
            let offset = 0;
            for (const chunk of chunks) {
                buffer.set(chunk, offset);
                offset += chunk.byteLength;
            }
            let data: unknown;
            try {
                data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
            } catch {
                throw new ExtensionError("The external API returned invalid JSON.", "invalid");
            }
            return parseResult("network.request", { status: response.status, data });
        } catch (error) {
            if (lifetime.aborted)
                throw new ExtensionError("Extension access was revoked.", "revoked");
            if (deadline.signal.aborted) throw deadline.signal.reason;
            if (error instanceof ExtensionError) throw error;
            console.error("External API transport failed.", {
                endpoint: endpoint.id,
                method: request.method,
            });
            throw new ExtensionError(
                "The API request failed. Check the service and its CORS policy.",
                "unavailable"
            );
        } finally {
            clearTimeout(approvalTimer);
            clearTimeout(networkTimer);
        }
    };
}

export type NetworkApprovalPrompt = { id: string; request: NetworkApproval };

export class NetworkApprovalQueue {
    private prompts: readonly NetworkApprovalPrompt[] = [];
    private listeners = new Set<() => void>();
    private remembered = new Set<string>();
    private pending = new Map<
        string,
        {
            resolve(allowed: boolean): void;
            reject(error: unknown): void;
            cleanup(): void;
        }
    >();
    private closed = false;
    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };
    getSnapshot = () => this.prompts;
    private publish() {
        for (const listener of this.listeners) listener();
    }
    approve = (request: NetworkApproval, signal: AbortSignal): Promise<boolean> => {
        if (this.closed || signal.aborted)
            return Promise.reject(new ExtensionError("API access was revoked.", "revoked"));
        if (request.method === "GET" && this.remembered.has(request.endpoint.url))
            return Promise.resolve(true);
        return new Promise((resolve, reject) => {
            const id = crypto.randomUUID();
            const abort = () => {
                this.remove(id);
                reject(
                    signal.reason instanceof ExtensionError
                        ? signal.reason
                        : new ExtensionError("API access was revoked.", "revoked")
                );
            };
            signal.addEventListener("abort", abort, { once: true });
            this.pending.set(id, {
                resolve,
                reject,
                cleanup: () => signal.removeEventListener("abort", abort),
            });
            this.prompts = [...this.prompts, { id, request: structuredClone(request) }];
            this.publish();
        });
    };
    private remove(id: string) {
        const pending = this.pending.get(id);
        pending?.cleanup();
        this.pending.delete(id);
        this.prompts = this.prompts.filter((prompt) => prompt.id !== id);
        this.publish();
        return pending;
    }
    answer(id: string, allowed: boolean, remember = false) {
        const prompt = this.prompts.find((item) => item.id === id);
        if (allowed && remember && prompt?.request.method === "GET")
            this.remembered.add(prompt.request.endpoint.url);
        this.remove(id)?.resolve(allowed);
    }
    dispose() {
        this.closed = true;
        this.remembered.clear();
        for (const id of [...this.pending.keys()])
            this.remove(id)?.reject(new ExtensionError("API access was revoked.", "revoked"));
        this.listeners.clear();
    }
}

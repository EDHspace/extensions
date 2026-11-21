import {
    apiVersion,
    protocol,
    extensionManifestSchema,
    requestSchema,
    parseResult,
    messageBytes,
    maxRequestBytes,
    maxResponseBytes,
    methodPermissions,
    ExtensionError,
    type ExtensionManifest,
    type ExtensionPermission,
    type ExtensionMethod,
    type ExtensionArguments,
    type ExtensionResults,
    type ExtensionResponse,
} from "./contracts";

export { extensionManifestSchema } from "./contracts";
export {
    createNetworkHandler,
    NetworkApprovalQueue,
    type NetworkApproval,
    type NetworkApprovalPrompt,
} from "./network";
export type { ExtensionManifest, ExtensionPermission, ExtensionTheme } from "./contracts";
export type ExtensionHandlers = {
    [K in ExtensionMethod]: (
        args: ExtensionArguments[K],
        signal: AbortSignal
    ) => Promise<ExtensionResults[K]>;
};

// Only the trusted host creates grants. Manifest declarations never grant access.
export class ExtensionSession {
    readonly manifest: ExtensionManifest;
    private readonly permissions: ReadonlySet<ExtensionPermission>;
    private readonly lifetime = new AbortController();
    private readonly seen = new Set<string>();
    private inFlight = 0;
    private windowStart = 0;
    private windowRequests = 0;
    constructor(
        manifest: ExtensionManifest,
        readonly sessionId: string,
        approved: readonly ExtensionPermission[],
        private readonly isCurrentResource: () => boolean,
        private readonly handlers: Partial<ExtensionHandlers>,
        private readonly now: () => number = Date.now
    ) {
        this.manifest = extensionManifestSchema.parse(structuredClone(manifest));
        if (approved.some((permission) => !this.manifest.permissions.includes(permission)))
            throw new ExtensionError("Cannot grant an undeclared permission.", "denied");
        this.permissions = new Set(approved);
    }
    revoke() {
        this.lifetime.abort();
    }
    private assertCurrent() {
        if (this.lifetime.signal.aborted || !this.isCurrentResource())
            throw new ExtensionError(
                "Extension access has been revoked. Approve access again.",
                "revoked"
            );
    }
    async execute(raw: unknown): Promise<ExtensionResponse> {
        const now = this.now();
        if (now - this.windowStart >= 60_000) {
            this.windowStart = now;
            this.windowRequests = 0;
        }
        if (++this.windowRequests > 30)
            throw new ExtensionError("The extension request limit was reached.", "rate-limited");
        if (messageBytes(raw) > maxRequestBytes)
            throw new ExtensionError("The extension request is too large.", "invalid");
        const parsed = requestSchema.safeParse(raw);
        if (!parsed.success)
            throw new ExtensionError("The extension request is invalid.", "invalid");
        const request = parsed.data;
        const base = {
            protocol,
            apiVersion,
            type: "response" as const,
            sessionId: this.sessionId,
            id: request.id,
        };
        let running = false;
        try {
            this.assertCurrent();
            if (request.sessionId !== this.sessionId)
                throw new ExtensionError(
                    "The request belongs to another extension session.",
                    "denied"
                );
            if (this.seen.size >= 256 || this.inFlight >= 4)
                throw new ExtensionError(
                    "The extension request limit was reached.",
                    "rate-limited"
                );
            if (this.seen.has(request.id))
                throw new ExtensionError(
                    "This extension request has already been processed.",
                    "replayed"
                );
            this.seen.add(request.id);
            const permission = methodPermissions[request.method];
            if (!this.permissions.has(permission))
                throw new ExtensionError(`Permission required: ${permission}.`, "denied");
            this.inFlight++;
            running = true;
            const result = await this.invoke(request.method, request.params);
            this.assertCurrent();
            const response = {
                ...base,
                ok: true as const,
                result: parseResult(request.method, result),
            };
            if (messageBytes(response) > maxResponseBytes)
                throw new ExtensionError("The extension result exceeds its size limit.", "invalid");
            return response;
        } catch (error) {
            if (this.lifetime.signal.aborted)
                error = new ExtensionError(
                    "Extension access has been revoked. Approve access again.",
                    "revoked"
                );
            if (!(error instanceof ExtensionError)) {
                console.error(`Extension operation failed: ${request.method}.`, error);
            }
            return {
                ...base,
                ok: false,
                error:
                    error instanceof ExtensionError
                        ? { code: error.code, message: error.message.slice(0, 300) }
                        : {
                              code: "unavailable",
                              message: "The extension operation failed. Try again.",
                          },
            };
        } finally {
            if (running) this.inFlight--;
        }
    }
    private async invoke<K extends ExtensionMethod>(
        method: K,
        args: ExtensionArguments[K]
    ): Promise<ExtensionResults[K]> {
        const handler = this.handlers[method];
        if (!handler)
            throw new ExtensionError(`This host has not enabled ${method}.`, "unavailable");
        return handler(args, this.lifetime.signal);
    }
}

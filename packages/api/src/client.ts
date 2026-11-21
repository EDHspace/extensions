import {
    protocol,
    apiVersion,
    requestSchema,
    networkRequestSchema,
    responseSchema,
    parseResult,
    messageBytes,
    maxRequestBytes,
    maxResponseBytes,
    ExtensionError,
    type DeckOperation,
    type ExtensionPermission,
    type ExtensionInvoker,
    type ExtensionMethod,
    type ExtensionArguments,
    type ExtensionResults,
    type NetworkRequest,
} from "./contracts";

export type ExtensionClient = ReturnType<typeof createExtensionClient>;
export function createExtensionClient(
    invoke: ExtensionInvoker,
    sessionId: string,
    permissions: readonly ExtensionPermission[],
    timeoutMs = 10_000,
    networkTimeoutMs = 90_000
) {
    const pending = new Map<
        string,
        { reject(error: ExtensionError): void; timer: ReturnType<typeof setTimeout> }
    >();
    let closed = false;
    let revision: string | undefined;
    const call = <K extends ExtensionMethod>(
        method: K,
        params: ExtensionArguments[K]
    ): Promise<ExtensionResults[K]> => {
        if (closed)
            return Promise.reject(
                new ExtensionError("Extension access has been revoked.", "revoked")
            );
        if (pending.size >= 4)
            return Promise.reject(new ExtensionError("Too many pending calls.", "rate-limited"));
        const parsed = requestSchema.safeParse({
            protocol,
            apiVersion,
            type: "request",
            sessionId,
            id: crypto.randomUUID(),
            method,
            params,
        });
        if (!parsed.success)
            return Promise.reject(
                new ExtensionError("The extension request is invalid.", "invalid")
            );
        const request = parsed.data;
        if (messageBytes(request) > maxRequestBytes)
            return Promise.reject(
                new ExtensionError("The extension request is too large.", "invalid")
            );
        return new Promise<ExtensionResults[K]>((resolve, reject) => {
            const timer = setTimeout(
                () => {
                    pending.delete(request.id);
                    reject(new ExtensionError("The extension operation timed out.", "timeout"));
                },
                method === "network.request" ? networkTimeoutMs : timeoutMs
            );
            pending.set(request.id, { timer, reject });
            Promise.resolve()
                .then(() => invoke(request))
                .then(
                    (raw) => {
                        if (!pending.has(request.id)) return;
                        pending.delete(request.id);
                        clearTimeout(timer);
                        try {
                            if (messageBytes(raw) > maxResponseBytes)
                                throw new ExtensionError(
                                    "The extension response is too large.",
                                    "invalid"
                                );
                            const response = responseSchema.parse(raw);
                            if (response.sessionId !== sessionId || response.id !== request.id)
                                throw new ExtensionError(
                                    "The host response belongs to another request.",
                                    "invalid"
                                );
                            if (!response.ok)
                                throw new ExtensionError(
                                    response.error.message,
                                    response.error.code
                                );
                            resolve(parseResult(method, response.result));
                        } catch (error) {
                            reject(
                                error instanceof ExtensionError
                                    ? error
                                    : new ExtensionError(
                                          "The host returned an invalid response.",
                                          "invalid"
                                      )
                            );
                        }
                    },
                    (error: unknown) => {
                        if (!pending.has(request.id)) return;
                        pending.delete(request.id);
                        clearTimeout(timer);
                        if (!(error instanceof ExtensionError))
                            console.error("Extension transport failed.", error);
                        reject(
                            error instanceof ExtensionError
                                ? error
                                : new ExtensionError(
                                      "The extension operation failed.",
                                      "unavailable"
                                  )
                        );
                    }
                );
        });
    };
    const propose = async (operations: DeckOperation[]) => {
        if (!revision)
            throw new ExtensionError("Read the deck before proposing changes.", "invalid");
        const receipt = await call("deck.propose", { operations, expectedRevision: revision });
        if (receipt.status === "applied") revision = receipt.revision;
        return receipt;
    };
    return {
        permissions: Object.freeze([...permissions]),
        deck: {
            read: async () => {
                const deck = await call("deck.read", {});
                revision = deck.revision;
                return deck;
            },
            propose,
            addCard: (cardId: string, category: string, quantity = 1) =>
                propose([{ op: "add", cardId, category, quantity }]),
            removeCard: (cardId: string, quantity = 1) =>
                propose([{ op: "remove", cardId, quantity }]),
            applyTags: (cardIds: string[], tags: string[]) =>
                propose([{ op: "tag", cardIds, tags }]),
        },
        selection: { read: () => call("selection.read", {}) },
        network: {
            request: (request: NetworkRequest) => {
                const parsed = networkRequestSchema.safeParse(request);
                return parsed.success
                    ? call("network.request", parsed.data)
                    : Promise.reject(new ExtensionError("The API request is invalid.", "invalid"));
            },
        },
        cards: {
            inspect: (cardId: string) => call("cards.inspect", { cardId }),
            search: (query: string, page = 1) => call("cards.search", { query, page }),
            getByName: (name: string) => call("cards.get", { name }),
        },
        workspace: {
            openPanel: (panelId: string, location: "workspace" | "sidebar" = "workspace") =>
                call("workspace.open", { panelId, location }),
        },
        notifications: {
            show: (message: string, kind: "info" | "success" | "error" = "info") =>
                call("notifications.show", { message, kind }),
        },
        storage: {
            get: (key: string) => call("storage.get", { key }),
            set: (key: string, value: ExtensionArguments["storage.set"]["value"]) =>
                call("storage.set", { key, value }),
        },
        preferences: {
            get: () => call("preferences.get", {}),
            set: (key: string, value: ExtensionArguments["preferences.set"]["value"]) =>
                call("preferences.set", { key, value }),
        },
        dispose: () => {
            closed = true;
            for (const item of pending.values()) {
                clearTimeout(item.timer);
                item.reject(new ExtensionError("Extension access has been revoked.", "revoked"));
            }
            pending.clear();
        },
    };
}

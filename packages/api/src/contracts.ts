import { z } from "zod";

export const protocol = "edhspace.extension" as const;
export const apiVersion = 1 as const;
export const maxRequestBytes = 8192;
export const maxResponseBytes = 262144;
export const permissionSchema = z.enum([
    "deck.read",
    "selection.read",
    "deck.propose",
    "cards.inspect",
    "cards.search",
    "workspace.open",
    "notifications.show",
    "storage.read",
    "storage.write",
    "preferences.read",
    "preferences.write",
    "network.request",
]);
export type ExtensionPermission = z.infer<typeof permissionSchema>;
const id = z.string().regex(/^[a-z0-9][a-z0-9.-]{0,99}$/);
const text = z.string().trim().min(1).max(300);
const token = z.uuid();
export const networkEndpointSchema = z.strictObject({
    id,
    title: text,
    url: z
        .string()
        .max(2000)
        .refine((value) => {
            try {
                const url = new URL(value);
                const host = url.hostname.replace(/\.$/, "");
                return (
                    url.protocol === "https:" &&
                    !url.username &&
                    !url.password &&
                    !url.search &&
                    !url.hash &&
                    (!url.port || url.port === "443") &&
                    host.includes(".") &&
                    !host.includes(":") &&
                    !/^\d+(?:\.\d+){3}$/.test(host) &&
                    !/(?:^|\.)(?:localhost|local|internal|home\.arpa)$/.test(host) &&
                    url.pathname.endsWith("/")
                );
            } catch {
                return false;
            }
        }, "Use a public HTTPS base URL ending in /, without credentials or query parameters."),
    methods: z
        .array(z.enum(["GET", "POST"]))
        .min(1)
        .max(2)
        .refine((values) => new Set(values).size === values.length),
});
export type NetworkEndpoint = z.infer<typeof networkEndpointSchema>;
export const networkRequestSchema = z
    .strictObject({
        endpoint: id,
        path: z
            .string()
            .max(500)
            .default("")
            .refine(
                (value) =>
                    /^[a-zA-Z0-9._~/-]*$/.test(value) &&
                    !value.startsWith("/") &&
                    !value.includes("//") &&
                    !value.split("/").some((part) => part === "." || part === ".."),
                "Use a relative API path without escaping its base URL."
            ),
        method: z.enum(["GET", "POST"]).default("GET"),
        query: z
            .record(z.string().min(1).max(100), z.string().max(2000))
            .default({})
            .refine((values) => Object.keys(values).length <= 20),
        body: z.json().optional(),
    })
    .refine(
        (value) => value.method !== "GET" || value.body === undefined,
        "GET requests cannot have a body."
    );
export type NetworkRequest = z.input<typeof networkRequestSchema>;
export const preferenceSchema = z
    .discriminatedUnion("type", [
        z.strictObject({
            id,
            title: text,
            description: text.optional(),
            type: z.literal("text"),
            default: z.string().max(1000),
        }),
        z.strictObject({
            id,
            title: text,
            description: text.optional(),
            type: z.literal("boolean"),
            default: z.boolean(),
        }),
        z.strictObject({
            id,
            title: text,
            description: text.optional(),
            type: z.literal("number"),
            default: z.number().finite(),
        }),
        z.strictObject({
            id,
            title: text,
            description: text.optional(),
            type: z.literal("select"),
            default: id,
            options: z
                .array(z.strictObject({ value: id, label: text }))
                .min(1)
                .max(30),
        }),
    ])
    .refine(
        (preference) =>
            preference.type !== "select" ||
            preference.options.some((option) => option.value === preference.default),
        "Default must be a declared option."
    );
export const extensionManifestSchema = z
    .strictObject({
        id,
        apiVersion: z.literal(apiVersion),
        version: z.string().regex(/^\d+\.\d+\.\d+$/),
        title: text,
        description: z.string().trim().min(1).max(1000),
        author: text,
        permissions: z
            .array(permissionSchema)
            .max(12)
            .refine((items) => new Set(items).size === items.length),
        panels: z
            .array(
                z.strictObject({
                    id,
                    title: text,
                    location: z.enum(["workspace", "sidebar"]).optional(),
                })
            )
            .min(1)
            .max(6)
            .refine((items) => new Set(items.map((item) => item.id)).size === items.length),
        commands: z
            .array(z.strictObject({ id, title: text }))
            .max(6)
            .default([]),
        preferences: z
            .array(preferenceSchema)
            .max(20)
            .default([])
            .refine((items) => new Set(items.map((item) => item.id)).size === items.length),
        network: z
            .array(networkEndpointSchema)
            .max(8)
            .default([])
            .refine((items) => new Set(items.map((item) => item.id)).size === items.length),
    })
    .refine(
        (manifest) =>
            manifest.permissions.includes("network.request") === manifest.network.length > 0,
        "Declare network.request and its reviewed API endpoints together."
    );
export type ExtensionManifest = z.infer<typeof extensionManifestSchema>;
export const extensionCardSchema = z.strictObject({
    id: z.string().min(1).max(200),
    name: text,
    quantity: z.number().int().min(1).max(1000),
    manaCost: z.string().max(200).optional(),
    manaValue: z.number().min(0).max(1000).optional(),
    typeLine: text.optional(),
    commander: z.boolean().optional(),
});
export type ExtensionCard = z.infer<typeof extensionCardSchema>;
export const extensionDeckSchema = z.strictObject({
    id: token,
    name: text,
    format: z.string().min(1).max(50),
    revision: z.string().min(1).max(200),
    cards: z.array(extensionCardSchema).max(500),
});
export type ExtensionDeck = z.infer<typeof extensionDeckSchema>;
export type ExtensionTheme = {
    background: string;
    foreground: string;
    muted: string;
    accent: string;
    border: string;
    font: string;
};
export const deckOperationSchema = z.discriminatedUnion("op", [
    z.strictObject({
        op: z.literal("add"),
        cardId: text,
        quantity: z.number().int().min(1).max(75),
        category: id,
    }),
    z.strictObject({
        op: z.literal("remove"),
        cardId: text,
        quantity: z.number().int().min(1).max(75),
    }),
    z.strictObject({
        op: z.literal("tag"),
        cardIds: z.array(text).min(1).max(100),
        tags: z.array(id).max(20),
    }),
]);
export type DeckOperation = z.infer<typeof deckOperationSchema>;
export const proposalReceiptSchema = z.discriminatedUnion("status", [
    z.strictObject({
        id: token,
        status: z.enum(["pending", "dismissed"]),
        revision: text.optional(),
        undoId: token.optional(),
    }),
    z.strictObject({ id: token, status: z.literal("applied"), revision: text, undoId: token }),
]);
export type ProposalReceipt = z.infer<typeof proposalReceiptSchema>;
const envelope = {
    protocol: z.literal(protocol),
    apiVersion: z.literal(apiVersion),
    sessionId: token,
};
const base = { ...envelope, type: z.literal("request"), id: token };
export const requestSchema = z.discriminatedUnion("method", [
    z.strictObject({ ...base, method: z.literal("network.request"), params: networkRequestSchema }),
    z.strictObject({ ...base, method: z.literal("deck.read"), params: z.strictObject({}) }),
    z.strictObject({ ...base, method: z.literal("selection.read"), params: z.strictObject({}) }),
    z.strictObject({
        ...base,
        method: z.literal("deck.propose"),
        params: z.strictObject({
            expectedRevision: text,
            operations: z.array(deckOperationSchema).min(1).max(75),
        }),
    }),
    z.strictObject({
        ...base,
        method: z.literal("cards.inspect"),
        params: z.strictObject({ cardId: text }),
    }),
    z.strictObject({
        ...base,
        method: z.literal("cards.search"),
        params: z.strictObject({ query: text, page: z.number().int().min(1).max(20) }),
    }),
    z.strictObject({
        ...base,
        method: z.literal("cards.get"),
        params: z.strictObject({ name: text }),
    }),
    z.strictObject({
        ...base,
        method: z.literal("workspace.open"),
        params: z.strictObject({ panelId: id, location: z.enum(["workspace", "sidebar"]) }),
    }),
    z.strictObject({
        ...base,
        method: z.literal("notifications.show"),
        params: z.strictObject({ message: text, kind: z.enum(["info", "success", "error"]) }),
    }),
    z.strictObject({
        ...base,
        method: z.literal("storage.get"),
        params: z.strictObject({ key: id }),
    }),
    z.strictObject({
        ...base,
        method: z.literal("storage.set"),
        params: z.strictObject({ key: id, value: z.json() }),
    }),
    z.strictObject({ ...base, method: z.literal("preferences.get"), params: z.strictObject({}) }),
    z.strictObject({
        ...base,
        method: z.literal("preferences.set"),
        params: z.strictObject({ key: id, value: z.json() }),
    }),
]);
export type ExtensionRequest = z.infer<typeof requestSchema>;
export type ExtensionMethod = ExtensionRequest["method"];
export type ExtensionArguments = {
    [K in ExtensionMethod]: Extract<ExtensionRequest, { method: K }>["params"];
};
export const resultSchemas = {
    "network.request": z.strictObject({
        status: z.number().int().min(200).max(299),
        data: z.json(),
    }),
    "deck.read": extensionDeckSchema,
    "selection.read": z.array(extensionCardSchema).max(100),
    "deck.propose": proposalReceiptSchema,
    "cards.inspect": z.strictObject({ opened: z.literal(true) }),
    "cards.search": z.strictObject({
        cards: z.array(extensionCardSchema).max(100),
        nextPage: z.number().int().min(1).max(20).optional(),
    }),
    "cards.get": extensionCardSchema.nullable(),
    "workspace.open": z.strictObject({ panelId: id }),
    "notifications.show": z.strictObject({ shown: z.literal(true) }),
    "storage.get": z.json(),
    "storage.set": z.strictObject({ saved: z.literal(true) }),
    "preferences.get": z.record(z.string(), z.json()),
    "preferences.set": z.strictObject({ saved: z.literal(true) }),
};
export type ExtensionResults = { [K in ExtensionMethod]: z.infer<(typeof resultSchemas)[K]> };
export const methodPermissions: Record<ExtensionMethod, ExtensionPermission> = {
    "network.request": "network.request",
    "deck.read": "deck.read",
    "selection.read": "selection.read",
    "deck.propose": "deck.propose",
    "cards.inspect": "cards.inspect",
    "cards.search": "cards.search",
    "cards.get": "cards.search",
    "workspace.open": "workspace.open",
    "notifications.show": "notifications.show",
    "storage.get": "storage.read",
    "storage.set": "storage.write",
    "preferences.get": "preferences.read",
    "preferences.set": "preferences.write",
};
export const errorCodeSchema = z.enum([
    "invalid",
    "denied",
    "revoked",
    "unavailable",
    "rate-limited",
    "replayed",
    "timeout",
    "disconnected",
]);
export type ExtensionErrorCode = z.infer<typeof errorCodeSchema>;
export class ExtensionError extends Error {
    constructor(
        message: string,
        readonly code: ExtensionErrorCode
    ) {
        super(message);
        this.name = "ExtensionError";
    }
}
export const responseSchema = z.discriminatedUnion("ok", [
    z.strictObject({
        ...envelope,
        type: z.literal("response"),
        id: token,
        ok: z.literal(true),
        result: z.unknown(),
    }),
    z.strictObject({
        ...envelope,
        type: z.literal("response"),
        id: token,
        ok: z.literal(false),
        error: z.strictObject({ code: errorCodeSchema, message: z.string().max(300) }),
    }),
]);
export type ExtensionResponse = z.infer<typeof responseSchema>;
export type ExtensionInvoker = (request: ExtensionRequest) => Promise<ExtensionResponse>;
export function messageBytes(value: unknown) {
    try {
        const encoded = JSON.stringify(value);
        if (!encoded) throw new Error("Missing message.");
        return new TextEncoder().encode(encoded).byteLength;
    } catch {
        throw new ExtensionError("The extension message is not serializable.", "invalid");
    }
}
export function parseResult<K extends ExtensionMethod>(
    method: K,
    value: unknown
): ExtensionResults[K] {
    const result = resultSchemas[method].safeParse(value);
    if (!result.success)
        throw new ExtensionError("The host returned an invalid result.", "invalid");
    return result.data as ExtensionResults[K];
}

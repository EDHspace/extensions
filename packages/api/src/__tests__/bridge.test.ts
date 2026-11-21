import { afterEach, describe, expect, it, vi } from "vitest";
import {
    apiVersion,
    protocol,
    extensionManifestSchema,
    proposalReceiptSchema,
    type ExtensionDeck,
    type ExtensionPermission,
    type ExtensionArguments,
} from "../contracts";
import { ExtensionSession } from "../host";
import { createExtensionClient } from "../client";

const sessionId = "11111111-1111-4111-8111-111111111111";
const deck: ExtensionDeck = {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Test deck",
    format: "commander",
    revision: "1",
    cards: [{ id: "ring", name: "Sol Ring", quantity: 1, manaCost: "{1}" }],
};
const manifest = extensionManifestSchema.parse({
    id: "test.summary",
    apiVersion,
    version: "0.1.0",
    title: "Summary",
    description: "Read one deck.",
    author: "Test",
    permissions: ["deck.read", "cards.inspect", "deck.propose", "cards.search"],
    panels: [{ id: "summary", title: "Summary" }],
});
function request(overrides: Record<string, unknown> = {}) {
    return {
        protocol,
        apiVersion,
        type: "request",
        sessionId,
        id: crypto.randomUUID(),
        method: "deck.read",
        params: {},
        ...overrides,
    };
}
function host(permissions: ExtensionPermission[] = ["deck.read", "cards.inspect"]) {
    let current = true;
    let time = 0;
    const handlers = {
        "deck.read": vi.fn(async () => deck),
        "cards.inspect": vi.fn(async () => ({ opened: true as const })),
    };
    const session = new ExtensionSession(
        manifest,
        sessionId,
        permissions,
        () => current,
        handlers,
        () => time
    );
    const client = createExtensionClient(
        (request) => session.execute(request),
        sessionId,
        permissions
    );
    cleanups.push(() => {
        session.revoke();
        client.dispose();
    });
    return {
        session,
        client,
        handlers,
        changeResource: () => {
            current = false;
        },
        advance: () => {
            time += 60_000;
        },
    };
}
const cleanups: Array<() => void> = [];
afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    vi.restoreAllMocks();
});

describe("native capability broker", () => {
    it("does not turn manifest requests into grants", async () => {
        const { session, handlers, client } = host([]);
        expect(await session.execute(request())).toMatchObject({
            ok: false,
            error: { code: "denied" },
        });
        await expect(client.deck.read()).rejects.toMatchObject({ code: "denied" });
        expect(handlers["deck.read"]).not.toHaveBeenCalled();
        expect(
            () =>
                new ExtensionSession(
                    { ...manifest, permissions: ["deck.read"] },
                    sessionId,
                    ["cards.inspect"],
                    () => true,
                    handlers
                )
        ).toThrow("undeclared");
    });
    it("supports typed reads and inspections through the direct native bridge", async () => {
        const { client, handlers } = host();
        expect(await client.deck.read()).toEqual(deck);
        expect(await client.cards.inspect("ring")).toEqual({ opened: true });
        expect(handlers["cards.inspect"]).toHaveBeenCalledWith(
            { cardId: "ring" },
            expect.any(AbortSignal)
        );
    });
    it("rejects other sessions and resources before running handlers", async () => {
        const { session, handlers, changeResource } = host();
        expect(await session.execute(request({ sessionId: crypto.randomUUID() }))).toMatchObject({
            error: { code: "denied" },
        });
        changeResource();
        expect(await session.execute(request())).toMatchObject({ error: { code: "revoked" } });
        expect(handlers["deck.read"]).not.toHaveBeenCalled();
    });
    it.each(["explicit", "resource"])(
        "suppresses pending results after %s revocation",
        async (cause) => {
            const { session, handlers, changeResource } = host();
            let finish!: (value: ExtensionDeck) => void;
            handlers["deck.read"].mockImplementation(
                () =>
                    new Promise((resolve) => {
                        finish = resolve;
                    })
            );
            const pending = session.execute(request());
            if (cause === "explicit") session.revoke();
            else changeResource();
            finish(deck);
            expect(await pending).toMatchObject({ error: { code: "revoked" } });
        }
    );
    it.each([
        { method: "account.read" },
        { params: { deckId: deck.id } },
        { extra: "private" },
        { id: "invalid" },
        { params: { padding: "x".repeat(9000) } },
    ])("rejects malformed requests: %j", async (overrides) => {
        const { session, handlers } = host();
        await expect(session.execute(request(overrides))).rejects.toMatchObject({
            code: "invalid",
        });
        expect(handlers["deck.read"]).not.toHaveBeenCalled();
    });
    it("rejects replays, including previously denied calls", async () => {
        const { session } = host([]);
        const raw = request();
        await session.execute(raw);
        expect(await session.execute(raw)).toMatchObject({ error: { code: "replayed" } });
    });
    it("counts malformed requests in the rate budget", async () => {
        const { session, advance } = host();
        for (let i = 0; i < 30; i++)
            await expect(session.execute({})).rejects.toMatchObject({ code: "invalid" });
        await expect(session.execute(request())).rejects.toMatchObject({ code: "rate-limited" });
        advance();
        expect(await session.execute(request())).toMatchObject({ ok: true });
    });
    it("bounds concurrent calls and remembered IDs", async () => {
        const { session, handlers, advance } = host();
        const finishes: Array<(value: ExtensionDeck) => void> = [];
        handlers["deck.read"].mockImplementation(
            () =>
                new Promise((resolve) => {
                    finishes.push(resolve);
                })
        );
        const pending = Array.from({ length: 4 }, () => session.execute(request()));
        expect(await session.execute(request())).toMatchObject({ error: { code: "rate-limited" } });
        finishes.forEach((finish) => finish(deck));
        await Promise.all(pending);
        handlers["deck.read"].mockResolvedValue(deck);
        for (let i = 4; i < 256; i++) {
            advance();
            expect(await session.execute(request())).toMatchObject({ ok: true });
        }
        advance();
        expect(await session.execute(request())).toMatchObject({ error: { code: "rate-limited" } });
    });
    it("rejects private fields and oversized results", async () => {
        const { session, handlers } = host();
        const privateDeck = { ...deck, privateNotes: "secret" };
        handlers["deck.read"].mockResolvedValue(privateDeck);
        expect(await session.execute(request())).toMatchObject({ error: { code: "invalid" } });
        handlers["deck.read"].mockResolvedValue({
            ...deck,
            cards: Array.from({ length: 500 }, (_, i) => ({
                id: `${i}${"i".repeat(190)}`,
                name: "n".repeat(300),
                quantity: 1,
                manaCost: "m".repeat(200),
            })),
        });
        expect(await session.execute(request())).toMatchObject({ error: { code: "invalid" } });
    });
    it("sanitizes and logs unexpected failures", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        const { session, handlers } = host();
        handlers["deck.read"].mockRejectedValue(new Error("private credential"));
        const result = await session.execute(request());
        expect(result).toMatchObject({ error: { code: "unavailable" } });
        expect(JSON.stringify(result)).not.toContain("private credential");
        expect(log).toHaveBeenCalledOnce();
    });
    it("denies write proposals without grants and rejects unimplemented capabilities explicitly", async () => {
        const { client } = host();
        await expect(client.deck.addCard("ring", "ramp")).rejects.toMatchObject({
            code: "invalid",
        });
        await client.deck.read();
        await expect(client.deck.addCard("ring", "ramp")).rejects.toMatchObject({ code: "denied" });
        const enabled = host(["deck.read", "deck.propose", "cards.search"]).client;
        await enabled.deck.read();
        await expect(enabled.deck.applyTags(["ring"], ["ramp"])).rejects.toMatchObject({
            code: "unavailable",
        });
        await expect(enabled.cards.search("Sol Ring")).rejects.toMatchObject({
            code: "unavailable",
        });
    });
    it("forwards pending proposals with the last read revision", async () => {
        const propose = vi.fn(async () => ({
            id: crypto.randomUUID(),
            status: "pending" as const,
        }));
        const session = new ExtensionSession(
            manifest,
            sessionId,
            ["deck.read", "deck.propose"],
            () => true,
            {
                "deck.read": async () => deck,
                "deck.propose": propose,
            }
        );
        const client = createExtensionClient((request) => session.execute(request), sessionId, [
            "deck.read",
            "deck.propose",
        ]);
        cleanups.push(() => client.dispose());
        await client.deck.read();
        expect(await client.deck.addCard("new-card", "ramp", 2)).toMatchObject({
            status: "pending",
        });
        expect(propose).toHaveBeenCalledWith(
            {
                expectedRevision: "1",
                operations: [{ op: "add", cardId: "new-card", quantity: 2, category: "ramp" }],
            },
            expect.any(AbortSignal)
        );
    });
    it("requires undo receipts for applied proposals and uses their revision for the next proposal", async () => {
        expect(
            proposalReceiptSchema.safeParse({
                id: crypto.randomUUID(),
                status: "applied",
                revision: "2",
            }).success
        ).toBe(false);
        let revision = 1;
        const propose = vi.fn(async (_args: ExtensionArguments["deck.propose"]) => ({
            id: crypto.randomUUID(),
            status: "applied" as const,
            revision: String(++revision),
            undoId: crypto.randomUUID(),
        }));
        const session = new ExtensionSession(
            manifest,
            sessionId,
            ["deck.read", "deck.propose"],
            () => true,
            {
                "deck.read": async () => deck,
                "deck.propose": propose,
            }
        );
        const client = createExtensionClient((request) => session.execute(request), sessionId, [
            "deck.read",
            "deck.propose",
        ]);
        cleanups.push(() => {
            client.dispose();
            session.revoke();
        });
        await client.deck.read();
        await client.deck.addCard("new-card", "ramp");
        await client.deck.addCard("other-card", "draw");
        expect(propose.mock.calls.map(([args]) => args.expectedRevision)).toEqual(["1", "2"]);
    });
});
describe("native client lifecycle", () => {
    it("times out unanswered calls and rejects pending calls on disposal", async () => {
        const invoke = () => new Promise<never>(() => {});
        const client = createExtensionClient(invoke, sessionId, [], 10);
        await expect(client.deck.read()).rejects.toMatchObject({ code: "timeout" });
        const pending = Array.from({ length: 4 }, () =>
            expect(client.deck.read()).rejects.toMatchObject({ code: "revoked" })
        );
        await expect(client.deck.read()).rejects.toMatchObject({ code: "rate-limited" });
        client.dispose();
        await Promise.all(pending);
        await expect(client.deck.read()).rejects.toMatchObject({ code: "revoked" });
    });
    it.each(["session", "id", "result"])("rejects mismatched %s responses", async (kind) => {
        const client = createExtensionClient(
            async (request) => ({
                protocol,
                apiVersion,
                type: "response",
                sessionId: kind === "session" ? crypto.randomUUID() : sessionId,
                id: kind === "id" ? crypto.randomUUID() : request.id,
                ok: true,
                result: kind === "result" ? {} : deck,
            }),
            sessionId,
            []
        );
        cleanups.push(() => client.dispose());
        await expect(client.deck.read()).rejects.toMatchObject({ code: "invalid" });
    });
});

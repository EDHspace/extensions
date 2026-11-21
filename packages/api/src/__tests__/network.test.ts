import { afterEach, expect, it, vi } from "vitest";
import { extensionManifestSchema, networkRequestSchema } from "../contracts";
import { createExtensionClient } from "../client";
import {
    ExtensionSession,
    createNetworkHandler,
    NetworkApprovalQueue,
    type NetworkApproval,
} from "../host";

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});
function fixture(
    approve = vi.fn<(request: NetworkApproval, signal: AbortSignal) => Promise<boolean>>(
        async () => true
    )
) {
    const manifest = extensionManifestSchema.parse({
        id: "test.network",
        version: "0.1.0",
        apiVersion: 1,
        title: "API test",
        description: "API fixture",
        author: "Test",
        permissions: ["network.request"],
        panels: [{ id: "api", title: "API" }],
        network: [
            {
                id: "service",
                title: "Test service",
                url: `https://${crypto.randomUUID()}.example/v1/`,
                methods: ["GET", "POST"],
            },
        ],
    });
    const transport = vi.fn<typeof fetch>(async () => Response.json({ found: true }));
    const handler = createNetworkHandler(manifest, { approve, fetch: transport });
    return { manifest, transport, handler, approve, signal: new AbortController().signal };
}
const get = {
    endpoint: "service",
    path: "cards",
    method: "GET" as const,
    query: { name: "Sol Ring" },
};

it("sends exactly the approved GET data without credentials, referrers or redirects", async () => {
    const f = fixture();
    expect(await f.handler(get, f.signal)).toEqual({ status: 200, data: { found: true } });
    expect(f.approve.mock.invocationCallOrder[0]).toBeLessThan(
        f.transport.mock.invocationCallOrder[0]
    );
    expect(f.approve.mock.calls[0][0]).toMatchObject({
        url: `${f.manifest.network[0].url}cards?name=Sol+Ring`,
        query: get.query,
    });
    expect(f.transport).toHaveBeenCalledWith(
        `${f.manifest.network[0].url}cards?name=Sol+Ring`,
        expect.objectContaining({
            method: "GET",
            credentials: "omit",
            redirect: "error",
            referrerPolicy: "no-referrer",
            cache: "no-store",
            headers: { Accept: "application/json" },
        })
    );
    expect(f.transport.mock.calls[0][1]).not.toHaveProperty("body");
});
it("sends POST JSON only after approval and prevents approval callbacks changing its data", async () => {
    const f = fixture(
        vi.fn(async (request) => {
            request.body = { tampered: true };
            return true;
        })
    );
    await f.handler({ ...get, method: "POST", body: { cards: ["Forest"] } }, f.signal);
    expect(f.transport.mock.calls[0][1]).toMatchObject({
        body: '{"cards":["Forest"]}',
        headers: { Accept: "application/json", "Content-Type": "application/json" },
    });
});
it("cancelled requests never reach the network", async () => {
    const f = fixture(vi.fn(async () => false));
    await expect(f.handler(get, f.signal)).rejects.toMatchObject({ code: "denied" });
    expect(f.transport).not.toHaveBeenCalled();
});
it("broker grants are checked before requesting approval", async () => {
    const f = fixture();
    const id = crypto.randomUUID();
    const session = new ExtensionSession(f.manifest, id, [], () => true, {
        "network.request": f.handler,
    });
    const client = createExtensionClient((request) => session.execute(request), id, []);
    await expect(client.network.request(get)).rejects.toMatchObject({ code: "denied" });
    expect(f.approve).not.toHaveBeenCalled();
    expect(f.transport).not.toHaveBeenCalled();
    session.revoke();
    client.dispose();
});
it.each([
    "../secret",
    "/secret",
    "//evil.example",
    "https://evil.example",
    "%2e%2e/secret",
    "a\\b",
    "a/./b",
])("rejects paths escaping the reviewed scope: %s", (path) => {
    expect(networkRequestSchema.safeParse({ ...get, path }).success).toBe(false);
});
it("rejects undeclared destinations, methods, headers, GET bodies and oversized requests", async () => {
    const f = fixture();
    await expect(f.handler({ ...get, endpoint: "other" }, f.signal)).rejects.toMatchObject({
        code: "denied",
    });
    expect(
        networkRequestSchema.safeParse({ ...get, headers: { Authorization: "secret" } }).success
    ).toBe(false);
    expect(networkRequestSchema.safeParse({ ...get, body: {} }).success).toBe(false);
    await expect(
        f.handler({ ...get, method: "POST", body: "x".repeat(9000) }, f.signal)
    ).rejects.toMatchObject({ code: "invalid" });
    const readOnly = structuredClone(f.manifest);
    readOnly.network[0].methods = ["GET"];
    await expect(
        createNetworkHandler(readOnly, { approve: f.approve, fetch: f.transport })(
            { ...get, method: "POST" },
            f.signal
        )
    ).rejects.toMatchObject({ code: "denied" });
    expect(f.transport).not.toHaveBeenCalled();
});
it.each([
    "http://api.example/",
    "https://localhost/",
    "https://127.0.0.1/",
    "https://[::1]/",
    "https://api.internal/",
    "https://user:secret@api.example/",
    "https://api.example/?secret=1",
    "https://api.example:8443/",
    "https://api.example/v1",
])("rejects unsafe endpoint metadata: %s", (url) => {
    const f = fixture();
    f.manifest.network[0].url = url;
    expect(extensionManifestSchema.safeParse(f.manifest).success).toBe(false);
});
it.each([
    [() => Response.json({}, { status: 429 }), "rate-limited"],
    [() => Response.json({}, { status: 500 }), "unavailable"],
    [() => new Response("not json"), "invalid"],
    [() => new Response("{", { headers: { "Content-Type": "application/json" } }), "invalid"],
    [() => Response.json({ huge: "x".repeat(131072) }), "invalid"],
])("surfaces provider and response failures", async (response, code) => {
    const f = fixture();
    f.transport.mockImplementationOnce(async () => response());
    await expect(f.handler(get, f.signal)).rejects.toMatchObject({ code });
});
it("times out approval even when its callback ignores cancellation", async () => {
    vi.useFakeTimers();
    const f = fixture(vi.fn(() => new Promise<boolean>(() => {})));
    const result = expect(f.handler(get, f.signal)).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(60001);
    await result;
    expect(f.transport).not.toHaveBeenCalled();
});
it("aborts in-flight requests on revocation and bounds network wait time", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.transport.mockImplementation(() => new Promise<Response>(() => {}));
    const controller = new AbortController();
    const revoked = expect(f.handler(get, controller.signal)).rejects.toMatchObject({
        code: "revoked",
    });
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await revoked;
    const timedOut = expect(f.handler(get, f.signal)).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(10001);
    await timedOut;
});
it("limits actual outbound traffic per API origin across handlers", async () => {
    const f = fixture();
    for (let i = 0; i < 5; i++) await f.handler(get, f.signal);
    const other = createNetworkHandler(f.manifest, { approve: f.approve, fetch: f.transport });
    await expect(other(get, f.signal)).rejects.toMatchObject({ code: "rate-limited" });
    expect(f.transport).toHaveBeenCalledTimes(5);
});
it("requires an explicitly supplied server-safe transport outside a browser", async () => {
    const f = fixture();
    await expect(
        createNetworkHandler(f.manifest, { approve: f.approve })(get, f.signal)
    ).rejects.toMatchObject({ code: "unavailable" });
});
it("serializes prompts, remembers only GET scope, and clears grants on dispose", async () => {
    const f = fixture();
    const queue = new NetworkApprovalQueue();
    const request = {
        endpoint: f.manifest.network[0],
        url: f.manifest.network[0].url,
        method: "GET" as const,
        query: {},
    };
    const first = queue.approve(request, f.signal);
    const second = queue.approve({ ...request, method: "POST" }, f.signal);
    expect(queue.getSnapshot()).toHaveLength(2);
    queue.answer(queue.getSnapshot()[0].id, true, true);
    expect(await first).toBe(true);
    queue.answer(queue.getSnapshot()[0].id, false, true);
    expect(await second).toBe(false);
    expect(await queue.approve(request, f.signal)).toBe(true);
    const post = expect(
        queue.approve({ ...request, method: "POST" }, f.signal)
    ).rejects.toMatchObject({ code: "revoked" });
    expect(queue.getSnapshot()).toHaveLength(1);
    queue.dispose();
    await post;
    expect(queue.getSnapshot()).toHaveLength(0);
    await expect(queue.approve(request, f.signal)).rejects.toMatchObject({ code: "revoked" });
});
it("removes cancelled prompts before any outbound call", async () => {
    const f = fixture();
    const queue = new NetworkApprovalQueue();
    const controller = new AbortController();
    const handler = createNetworkHandler(f.manifest, {
        approve: queue.approve,
        fetch: f.transport,
    });
    const result = expect(handler(get, controller.signal)).rejects.toMatchObject({
        code: "revoked",
    });
    expect(queue.getSnapshot()).toHaveLength(1);
    controller.abort();
    await result;
    expect(queue.getSnapshot()).toHaveLength(0);
    expect(f.transport).not.toHaveBeenCalled();
});

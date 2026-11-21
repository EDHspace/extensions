import { createRequire } from "node:module";
import { expect, it } from "vitest";
import { ExtensionError } from "../../dist/index.js";
import { ExtensionSession } from "../../dist/host.js";
import { extensionManifestSchema, type ExtensionDeck } from "../contracts";

it("preserves error identity across built core and host exports in ESM and CommonJS", async () => {
    const manifest = extensionManifestSchema.parse({
        id: "test.exports",
        apiVersion: 1,
        version: "0.1.0",
        title: "Exports",
        description: "Check package entry points.",
        author: "Test",
        permissions: ["deck.read"],
        panels: [{ id: "exports", title: "Exports" }],
    });
    const sessionId = crypto.randomUUID();
    const require = createRequire(import.meta.url);
    const commonCore: typeof import("../../dist/index.js") = require("../../dist/index.cjs");
    const commonHost: typeof import("../../dist/host.js") = require("../../dist/host.cjs");
    for (const [ErrorClass, SessionClass] of [
        [ExtensionError, ExtensionSession],
        [commonCore.ExtensionError, commonHost.ExtensionSession],
    ] as const) {
        const session = new SessionClass(manifest, sessionId, ["deck.read"], () => true, {
            "deck.read": async (): Promise<ExtensionDeck> => {
                throw new ErrorClass("No access.", "denied");
            },
            "cards.inspect": async () => ({ opened: true }),
        });
        expect(
            await session.execute({
                protocol: "edhspace.extension",
                apiVersion: 1,
                type: "request",
                sessionId,
                id: crypto.randomUUID(),
                method: "deck.read",
                params: {},
            })
        ).toMatchObject({ ok: false, error: { code: "denied", message: "No access." } });
    }
});

import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("drops unused API entry points while preserving an imported calculation", async () => {
    const result = await build({
        stdin: {
            contents: `
                import "@edhspace/api";
                import "@edhspace/api/host";
                import "@edhspace/api/react";
                import { manaCurve } from "@edhspace/api/math";
                export const curve = manaCurve([
                    { id: "ring", name: "Sol Ring", quantity: 2, manaValue: 1 },
                    { id: "forest", name: "Forest", quantity: 8, typeLine: "Basic Land" }
                ]);
            `,
            resolveDir: fileURLToPath(new URL("../../../", import.meta.url)),
        },
        bundle: true,
        format: "esm",
        platform: "browser",
        write: false,
        metafile: true,
        logLevel: "silent",
    });
    const output = Object.values(result.metafile!.outputs)[0];
    const retained = Object.entries(output.inputs)
        .filter(([, input]) => input.bytesInOutput > 0)
        .map(([name]) => name);
    expect(retained.filter((name) => name.includes("/api/dist/"))).toHaveLength(1);
    expect(retained.some((name) => name.endsWith("/api/dist/math.js"))).toBe(true);
    expect(retained.some((name) => /(?:zod|react)/.test(name))).toBe(false);
    const module = await import(
        `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`
    );
    expect(module.curve).toEqual([{ manaValue: "1", count: 2 }]);
});

import { defineConfig } from "tsup";
import { chmod } from "node:fs/promises";
export default defineConfig({
    entry: ["src/cli.ts"],
    format: ["esm"],
    clean: true,
    external: ["typescript", "esbuild", "@edhspace/api", "@edhspace/ui"],
    onSuccess: async () => {
        await chmod("dist/cli.js", 0o755);
    },
});

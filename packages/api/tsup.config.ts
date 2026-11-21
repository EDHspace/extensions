import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts", "src/host.ts", "src/react.tsx", "src/math.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    splitting: true,
    external: ["react"],
});

import { expect, it, vi } from "vitest";
import { devExtension } from "../dev";

const bundler = vi.hoisted(() => ({
    rebuild: vi.fn(),
    watch: vi.fn(),
    dispose: vi.fn(),
}));
vi.mock("esbuild", () => ({ context: async () => bundler }));
vi.mock("node:fs/promises", () => ({ mkdir: vi.fn(), readFile: vi.fn() }));
vi.mock("../build", () => ({
    validateExtension: async () => ({
        root: "mock-extension",
        pkg: { panels: [{ entry: "src/index.tsx" }] },
        manifest: {},
    }),
    importBoundary: () => ({}),
}));

it("disposes the bundler when initial workbench compilation fails", async () => {
    const failure = new Error("Initial extension compilation failed.");
    bundler.rebuild.mockRejectedValueOnce(failure);
    await expect(devExtension("mock-extension")).rejects.toBe(failure);
    expect(bundler.dispose).toHaveBeenCalledOnce();
    expect(bundler.watch).not.toHaveBeenCalled();
});

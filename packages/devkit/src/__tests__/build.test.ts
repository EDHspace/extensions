import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { buildExtension, validateExtension } from "../build";
import { inspectDependency } from "../dependencies";
import type { DependencyReview } from "../approved-dependencies";
import { createHash } from "node:crypto";

const cleanup: string[] = [];
afterEach(async () => {
    for (const root of cleanup.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(source = "export default function Panel() { return null; }") {
    const temp = await mkdtemp(path.join(tmpdir(), "edhspace-extension-"));
    cleanup.push(temp);
    const root = path.join(temp, "extension");
    await mkdir(path.join(root, "src"), { recursive: true });
    await mkdir(path.join(root, "assets"));
    await mkdir(path.join(root, "node_modules", "@edhspace"), { recursive: true });
    const require = createRequire(import.meta.url);
    await symlink(
        path.dirname(path.dirname(require.resolve("@edhspace/api"))),
        path.join(root, "node_modules", "@edhspace", "api"),
        "dir"
    );
    await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({
            name: "@edhspace-extension/test",
            version: "0.1.0",
            type: "module",
            title: "Test",
            description: "Build fixture",
            author: "Test",
            icon: "assets/icon.svg",
            apiVersion: 1,
            permissions: ["deck.read"],
            panels: [{ id: "test", title: "Test", entry: "src/index.tsx" }],
            peerDependencies: { "@edhspace/api": "^0.1.0" },
            exports: {
                ".": { types: "./dist/index.d.ts", import: "./dist/test.js" },
                "./package.json": "./package.json",
            },
        })
    );
    await writeFile(
        path.join(root, "tsconfig.json"),
        JSON.stringify({
            compilerOptions: {
                strict: true,
                target: "ES2022",
                module: "ESNext",
                moduleResolution: "Bundler",
                lib: ["ES2022", "DOM"],
                skipLibCheck: true,
                noEmit: true,
            },
            include: ["src"],
        })
    );
    await writeFile(
        path.join(root, "assets", "icon.svg"),
        '<svg xmlns="http://www.w3.org/2000/svg"/>'
    );
    await writeFile(path.join(root, "src", "index.tsx"), source);
    return { root, temp };
}
it("builds a typed ESM artifact and records its hash", async () => {
    const { root } = await fixture();
    await buildExtension(root);
    const artifact = await readFile(path.join(root, "dist", "test.js"), "utf8");
    expect(artifact).toContain("export");
    const metadata = JSON.parse(await readFile(path.join(root, "dist", "build.json"), "utf8"));
    expect(metadata.artifacts[0]).toMatchObject({
        file: "test.js",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(await readFile(path.join(root, "dist", "index.d.ts"), "utf8")).toContain("Panel");
});
it.each([
    [
        'import { ExtensionSession } from "@edhspace/api/host"; export default ()=>ExtensionSession;',
        "Forbidden extension import",
    ],
    ["export default function Panel(){ return document.title; }", "browser global document"],
    ['export default function Panel(){ const name="./other"; return import(name); }', "literal"],
])("rejects forbidden native-extension code", async (source, message) => {
    const { root } = await fixture(source);
    await expect(validateExtension(root)).rejects.toThrow(message);
});
it("rejects symlinked private imports and oversized artifacts", async () => {
    const { root, temp } = await fixture(
        'export { value } from "./leak"; export default ()=>null;'
    );
    const privateFile = path.join(temp, "private.ts");
    await writeFile(privateFile, "export const value=1;");
    await symlink(privateFile, path.join(root, "src", "leak.ts"));
    await expect(buildExtension(root)).rejects.toThrow("symlink");
    const large = await fixture(
        `export const payload="${"x".repeat(270_000)}";export default ()=>null;`
    );
    await expect(buildExtension(large.root)).rejects.toThrow("256 KiB");
});

async function reviewedFixture(source = "export const value=42;") {
    const f = await fixture('import { value } from "reviewed-math"; export default ()=>value;');
    const directory = path.join(f.root, "node_modules", "reviewed-math");
    await mkdir(directory);
    await writeFile(
        path.join(directory, "package.json"),
        JSON.stringify({
            name: "reviewed-math",
            version: "1.0.0",
            license: "ISC",
            type: "module",
            exports: { ".": { types: "./index.d.ts", import: "./index.js" } },
        })
    );
    await writeFile(path.join(directory, "index.js"), source);
    await writeFile(path.join(directory, "index.d.ts"), "export const value: number;");
    await writeFile(path.join(directory, "LICENSE"), "Test fixture license.");
    const installed = await inspectDependency(directory);
    const review: DependencyReview = {
        name: installed.name,
        version: installed.version,
        license: installed.license,
        filesSha256: installed.filesSha256,
        licenseFiles: ["LICENSE"],
        imports: ["reviewed-math"],
        dependencies: {},
        integrity: `sha512-${createHash("sha512").update("test archive").digest("base64")}`,
        review: "https://github.com/EDHspace/extensions/issues/1",
    };
    const pkg = JSON.parse(await readFile(path.join(f.root, "package.json"), "utf8"));
    pkg.dependencies = { "reviewed-math": "1.0.0" };
    await writeFile(path.join(f.root, "package.json"), JSON.stringify(pkg));
    await writeFile(
        path.join(f.root, "package-lock.json"),
        JSON.stringify({
            packages: {
                "node_modules/reviewed-math": {
                    version: review.version,
                    integrity: review.integrity,
                    resolved: "https://registry.npmjs.org/reviewed-math/-/reviewed-math-1.0.0.tgz",
                },
            },
        })
    );
    return { ...f, directory, pkg, review };
}
it("bundles reviewed exact dependencies and retains their licensing/hash inventory", async () => {
    const f = await reviewedFixture();
    await buildExtension(f.root, [f.review]);
    expect(await readFile(path.join(f.root, "dist", "test.js"), "utf8")).toContain("42");
    const metadata = JSON.parse(await readFile(path.join(f.root, "dist", "build.json"), "utf8"));
    expect(metadata.dependencies).toEqual([f.review]);
    expect(metadata.licenses).toHaveLength(1);
    expect(await readFile(path.join(f.root, "dist", metadata.licenses[0].file), "utf8")).toBe(
        "Test fixture license."
    );
});
it("rejects unreviewed libraries, ranges, changed files and mismatching archive integrity", async () => {
    const f = await reviewedFixture();
    await expect(validateExtension(f.root)).rejects.toThrow("Unreviewed");
    f.pkg.dependencies["reviewed-math"] = "^1.0.0";
    await writeFile(path.join(f.root, "package.json"), JSON.stringify(f.pkg));
    await expect(validateExtension(f.root, [f.review])).rejects.toThrow("Unreviewed");
    f.pkg.dependencies["reviewed-math"] = "1.0.0";
    await writeFile(path.join(f.root, "package.json"), JSON.stringify(f.pkg));
    await writeFile(path.join(f.directory, "index.js"), "export const value=99;");
    await expect(validateExtension(f.root, [f.review])).rejects.toThrow("reviewed files");
    f.review.filesSha256 = (await inspectDependency(f.directory)).filesSha256;
    await writeFile(
        path.join(f.root, "package-lock.json"),
        JSON.stringify({
            packages: {
                "node_modules/reviewed-math": {
                    version: "1.0.0",
                    integrity: "wrong",
                    resolved: "https://registry.npmjs.org/",
                },
            },
        })
    );
    await expect(validateExtension(f.root, [f.review])).rejects.toThrow(
        "reviewed registry archive"
    );
});

it("verifies and bundles the complete approved transitive graph", async () => {
    const f = await reviewedFixture(
        'import { extra } from "reviewed-helper"; export const value=40+extra;'
    );
    const helper = path.join(f.root, "node_modules", "reviewed-helper");
    await mkdir(helper);
    await writeFile(
        path.join(helper, "package.json"),
        JSON.stringify({
            name: "reviewed-helper",
            version: "2.0.0",
            license: "ISC",
            type: "module",
            exports: { ".": { types: "./index.d.ts", import: "./index.js" } },
        })
    );
    await writeFile(path.join(helper, "index.js"), "export const extra=2;");
    await writeFile(path.join(helper, "index.d.ts"), "export const extra: number;");
    await writeFile(path.join(helper, "LICENSE"), "Helper fixture license.");
    const pkg = JSON.parse(await readFile(path.join(f.directory, "package.json"), "utf8"));
    pkg.dependencies = { "reviewed-helper": "^2.0.0" };
    await writeFile(path.join(f.directory, "package.json"), JSON.stringify(pkg));
    f.review.dependencies = { "reviewed-helper": "2.0.0" };
    f.review.filesSha256 = (await inspectDependency(f.directory)).filesSha256;
    const helperReview: DependencyReview = {
        ...f.review,
        name: "reviewed-helper",
        version: "2.0.0",
        filesSha256: (await inspectDependency(helper)).filesSha256,
        imports: ["reviewed-helper"],
        dependencies: {},
    };
    const lock = JSON.parse(await readFile(path.join(f.root, "package-lock.json"), "utf8"));
    lock.packages["node_modules/reviewed-helper"] = {
        version: "2.0.0",
        integrity: helperReview.integrity,
        resolved: "https://registry.npmjs.org/reviewed-helper/-/reviewed-helper-2.0.0.tgz",
    };
    await writeFile(path.join(f.root, "package-lock.json"), JSON.stringify(lock));
    await buildExtension(f.root, [f.review, helperReview]);
    const metadata = JSON.parse(await readFile(path.join(f.root, "dist", "build.json"), "utf8"));
    expect(metadata.dependencies.map((entry: DependencyReview) => entry.name)).toEqual([
        "reviewed-math",
        "reviewed-helper",
    ]);
    expect(metadata.licenses).toHaveLength(2);
    expect(await readFile(path.join(f.root, "dist", "test.js"), "utf8")).not.toContain(
        "reviewed-helper"
    );
});
it("rejects unreviewed transitive dependencies and dependency install scripts", async () => {
    const f = await reviewedFixture();
    const pkg = JSON.parse(await readFile(path.join(f.directory, "package.json"), "utf8"));
    pkg.dependencies = { "unreviewed-transitive": "^2.0.0" };
    await writeFile(path.join(f.directory, "package.json"), JSON.stringify(pkg));
    f.review.filesSha256 = (await inspectDependency(f.directory)).filesSha256;
    await expect(validateExtension(f.root, [f.review])).rejects.toThrow("Dependency graph");
    f.review.dependencies = { "unreviewed-transitive": "2.0.0" };
    await expect(validateExtension(f.root, [f.review])).rejects.toThrow("Unreviewed");
    pkg.dependencies = {};
    pkg.scripts = { postinstall: "unsafe" };
    await writeFile(path.join(f.directory, "package.json"), JSON.stringify(pkg));
    f.review.dependencies = {};
    f.review.filesSha256 = (await inspectDependency(f.directory)).filesSha256;
    await expect(validateExtension(f.root, [f.review])).rejects.toThrow("lifecycle");
    pkg.scripts = {};
    pkg.bin = { tsup: "./unsafe.js" };
    await writeFile(path.join(f.directory, "package.json"), JSON.stringify(pkg));
    f.review.filesSha256 = (await inspectDependency(f.directory)).filesSha256;
    await expect(validateExtension(f.root, [f.review])).rejects.toThrow("executable bins");
});
it("blocks raw networking even in a hashed and approved dependency", async () => {
    const f = await reviewedFixture('export const value=fetch("https://api.example/");');
    await expect(buildExtension(f.root, [f.review])).rejects.toThrow("forbidden browser API fetch");
});
it("rejects extension installation scripts", async () => {
    const f = await fixture();
    const pkg = JSON.parse(await readFile(path.join(f.root, "package.json"), "utf8"));
    pkg.scripts = { preinstall: "unsafe" };
    await writeFile(path.join(f.root, "package.json"), JSON.stringify(pkg));
    await expect(validateExtension(f.root)).rejects.toThrow("lifecycle");
    pkg.scripts = {};
    pkg.bin = { tsup: "./unsafe.js" };
    await writeFile(path.join(f.root, "package.json"), JSON.stringify(pkg));
    await expect(validateExtension(f.root)).rejects.toThrow("Executable bins");
});

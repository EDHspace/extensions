import { readFile, mkdir, writeFile, realpath, stat, lstat, rm } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";
import { build, type Plugin } from "esbuild";
import { extensionPackageSchema, toExtensionManifest } from "@edhspace/api";
import { verifyDependencies, type VerifiedDependency } from "./dependencies";
import { approvedDependencies, type DependencyReview } from "./approved-dependencies";

const shared = ["@edhspace/api", "@edhspace/ui", "react", "react-dom"];
const packageName = (specifier: string) =>
    specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0];
export function allowedImport(specifier: string, dependencies: readonly VerifiedDependency[] = []) {
    return (
        specifier.startsWith(".") ||
        (shared.includes(packageName(specifier)) && !specifier.startsWith("@edhspace/api/host")) ||
        dependencies.some((entry) => entry.review.imports.includes(specifier))
    );
}
const printDiagnostics = (diagnostics: readonly ts.Diagnostic[]) =>
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: () => process.cwd(),
        getCanonicalFileName: (file) => file,
        getNewLine: () => "\n",
    });
export async function validateExtension(
    directory: string,
    policy: readonly DependencyReview[] = approvedDependencies
) {
    const root = await realpath(directory);
    const raw: unknown = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    const pkg = extensionPackageSchema.parse(raw);
    const manifest = toExtensionManifest(raw);
    const dependencies = await verifyDependencies(root, pkg, policy);
    const directDependencies = dependencies.filter(
        (entry) =>
            entry.review.name in pkg.dependencies || entry.review.name in pkg.peerDependencies
    );
    for (const entry of [
        pkg.icon,
        ...pkg.panels.map((panel) => panel.entry),
        ...pkg.commands.map((command) => command.entry),
    ]) {
        const resolved = await realpath(path.join(root, entry));
        if (!resolved.startsWith(`${root}${path.sep}`))
            throw new Error(`Extension file escapes its directory: ${entry}.`);
        if (!(await stat(resolved)).isFile())
            throw new Error(`Extension entry is not a file: ${entry}.`);
    }
    const configPath = path.join(root, "tsconfig.json");
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    if (config.error) throw new Error(printDiagnostics([config.error]));
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    if (parsed.errors.length) throw new Error(printDiagnostics(parsed.errors));
    if (
        parsed.options.strict !== true ||
        [
            parsed.options.noImplicitAny,
            parsed.options.strictNullChecks,
            parsed.options.strictFunctionTypes,
            parsed.options.strictBindCallApply,
            parsed.options.strictPropertyInitialization,
            parsed.options.alwaysStrict,
            parsed.options.strictBuiltinIteratorReturn,
            parsed.options.useUnknownInCatchVariables,
        ].includes(false)
    )
        throw new Error("Extensions must enable strict TypeScript without disabling its checks.");
    if (parsed.fileNames.some((file) => !file.startsWith(`${root}${path.sep}`)))
        throw new Error("Extension TypeScript sources must stay inside the extension directory.");
    const options = { ...parsed.options, noEmit: true, strict: true };
    const program = ts.createProgram(parsed.fileNames, options);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length) throw new Error(printDiagnostics(diagnostics));
    const forbidden = new Set([
        "window",
        "document",
        "globalThis",
        "localStorage",
        "sessionStorage",
        "fetch",
        "eval",
        "Function",
        "parent",
        "top",
        "self",
        "alert",
        "confirm",
        "prompt",
        "navigator",
        "XMLHttpRequest",
        "WebSocket",
        "EventSource",
        "Worker",
        "SharedWorker",
        "importScripts",
        "Image",
        "process",
    ]);
    const checker = program.getTypeChecker();
    for (const source of program.getSourceFiles()) {
        if (!source.fileName.startsWith(`${root}${path.sep}`) || source.isDeclarationFile) continue;
        const visit = (node: ts.Node) => {
            const imported =
                ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
                    ? node.moduleSpecifier
                    : ts.isCallExpression(node) &&
                        node.expression.kind === ts.SyntaxKind.ImportKeyword
                      ? node.arguments[0]
                      : undefined;
            if (imported && ts.isStringLiteral(imported)) {
                if (
                    !allowedImport(imported.text, directDependencies) ||
                    (imported.text.startsWith(".") &&
                        !path
                            .resolve(path.dirname(source.fileName), imported.text)
                            .startsWith(`${root}${path.sep}`))
                )
                    throw new Error(`Forbidden extension import: ${imported.text}.`);
            }
            if (ts.isIdentifier(node) && forbidden.has(node.text)) {
                const symbol = checker.getSymbolAtLocation(node);
                if (
                    symbol?.declarations?.some((declaration) =>
                        /[/\\]lib\.[^/\\]+\.d\.ts$/.test(declaration.getSourceFile().fileName)
                    )
                )
                    throw new Error(
                        `Use the SDK instead of browser global ${node.text} in ${path.relative(root, source.fileName)}.`
                    );
            }
            if (
                ts.isCallExpression(node) &&
                node.expression.kind === ts.SyntaxKind.ImportKeyword &&
                !ts.isStringLiteral(node.arguments[0])
            )
                throw new Error(
                    "Extension dynamic imports must use literal, reviewed module paths."
                );
            ts.forEachChild(node, visit);
        };
        visit(source);
    }
    return { root, pkg, manifest, program, options, dependencies, directDependencies };
}
export function importBoundary(
    root: string,
    dependencies: readonly VerifiedDependency[] = [],
    directDependencies: readonly VerifiedDependency[] = dependencies
): Plugin {
    return {
        name: "edhspace-extension-boundary",
        setup(builder) {
            builder.onResolve({ filter: /.*/ }, async (args) => {
                if (args.pluginData?.boundaryChecked) return;
                const owner = [root, ...dependencies.map((entry) => entry.root)]
                    .sort((a, b) => b.length - a.length)
                    .find((directory) => args.importer.startsWith(`${directory}${path.sep}`));
                if (!owner) return;
                if (args.path.startsWith(".")) {
                    const target = path.resolve(path.dirname(args.importer), args.path);
                    if (!target.startsWith(`${owner}${path.sep}`))
                        return {
                            errors: [
                                { text: `Extension import escapes its directory: ${args.path}.` },
                            ],
                        };
                    const resolved = await builder.resolve(args.path, {
                        importer: args.importer,
                        resolveDir: args.resolveDir,
                        kind: args.kind,
                        pluginData: { boundaryChecked: true },
                    });
                    if (resolved.errors.length) return resolved;
                    if (!(await realpath(resolved.path)).startsWith(`${owner}${path.sep}`))
                        return {
                            errors: [
                                {
                                    text: `Extension import follows a symlink outside its directory: ${args.path}.`,
                                },
                            ],
                        };
                    return resolved;
                } else {
                    const packageOwner = dependencies.find((entry) => entry.root === owner);
                    const permitted = packageOwner
                        ? dependencies.filter(
                              (entry) =>
                                  entry.review.name === packageOwner.review.name ||
                                  entry.review.name in packageOwner.review.dependencies
                          )
                        : directDependencies;
                    if (!allowedImport(args.path, permitted))
                        return { errors: [{ text: `Forbidden extension import: ${args.path}.` }] };
                }
                return undefined;
            });
            builder.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
                if (!dependencies.some((entry) => args.path.startsWith(entry.root + path.sep)))
                    return;
                const source = ts.createSourceFile(
                    args.path,
                    await readFile(args.path, "utf8"),
                    ts.ScriptTarget.Latest,
                    true
                );
                const blocked = new Set([
                    "fetch",
                    "XMLHttpRequest",
                    "WebSocket",
                    "EventSource",
                    "window",
                    "document",
                    "globalThis",
                    "navigator",
                    "eval",
                    "Function",
                    "localStorage",
                    "sessionStorage",
                    "Worker",
                    "SharedWorker",
                    "importScripts",
                ]);
                function visit(node: ts.Node) {
                    if (ts.isIdentifier(node) && blocked.has(node.text))
                        throw new Error(
                            `Reviewed dependency uses forbidden browser API ${node.text}: ${args.path}.`
                        );
                    ts.forEachChild(node, visit);
                }
                visit(source);
                return undefined;
            });
        },
    };
}
export async function buildExtension(
    directory: string,
    policy: readonly DependencyReview[] = approvedDependencies
) {
    const context = await validateExtension(directory, policy);
    const entries = Object.fromEntries([
        ...context.pkg.panels.map((panel) => [panel.id, path.join(context.root, panel.entry)]),
        ...context.pkg.commands.map((command) => [
            `command-${command.id}`,
            path.join(context.root, command.entry),
        ]),
    ]);
    const output = path.join(context.root, "dist");
    const result = await build({
        entryPoints: entries,
        outdir: output,
        write: false,
        bundle: true,
        format: "esm",
        platform: "browser",
        target: "es2022",
        minify: true,
        metafile: true,
        loader: { ".svg": "file", ".png": "file" },
        external: shared.flatMap((name) => [name, `${name}/*`]),
        plugins: [importBoundary(context.root, context.dependencies, context.directDependencies)],
    });
    for (const file of result.outputFiles)
        if (file.contents.byteLength > 262144)
            throw new Error(`Bundle exceeds 256 KiB: ${path.basename(file.path)}.`);
    try {
        const existing = await lstat(output);
        if (existing.isSymbolicLink() || !existing.isDirectory())
            throw new Error("Extension dist output must be a regular directory.");
        await rm(output, { recursive: true });
    } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    await mkdir(output, { recursive: true });
    for (const file of result.outputFiles) await writeFile(file.path, file.contents);
    const licenses = [];
    for (const dependency of context.dependencies)
        for (const file of dependency.review.licenseFiles) {
            const name = `${dependency.review.name.replace(/[@/]/g, "-")}-${dependency.review.version}-${path.basename(file)}`;
            const bytes = await readFile(path.join(dependency.root, file));
            await mkdir(path.join(output, "licenses"), { recursive: true });
            await writeFile(path.join(output, "licenses", name), bytes);
            licenses.push({
                file: `licenses/${name}`,
                sha256: createHash("sha256").update(bytes).digest("hex"),
            });
        }
    const declarations = ts.createProgram(context.program.getRootFileNames(), {
        ...context.options,
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
        rootDir: path.join(context.root, "src"),
        outDir: output,
    });
    const emitted = declarations.emit();
    if (emitted.emitSkipped || emitted.diagnostics.length)
        throw new Error(printDiagnostics(emitted.diagnostics));
    await writeFile(
        path.join(output, "build.json"),
        JSON.stringify(
            {
                manifest: context.manifest,
                apiVersion: context.pkg.apiVersion,
                dependencies: context.dependencies.map((dependency) => dependency.review),
                licenses,
                artifacts: result.outputFiles.map((file) => ({
                    file: path.basename(file.path),
                    bytes: file.contents.byteLength,
                    sha256: createHash("sha256").update(file.contents).digest("hex"),
                })),
            },
            null,
            2
        )
    );
    return context;
}

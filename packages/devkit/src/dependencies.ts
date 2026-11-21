import { createHash } from "node:crypto";
import { readFile, readdir, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { approvedDependencies, type DependencyReview } from "./approved-dependencies";

const lifecycle = ["preinstall", "install", "postinstall", "prepare"];
const official = ["react", "react-dom", "@edhspace/api", "@edhspace/ui"];
const semver = /^\^?\d+\.\d+\.\d+$/;
type Package = {
    name: string;
    version: string;
    license: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    bin?: string | Record<string, string>;
};
export type VerifiedDependency = { root: string; review: DependencyReview };

export async function inspectDependency(directory: string) {
    const root = await realpath(directory);
    const pkg: Package = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    if (
        typeof pkg.name !== "string" ||
        !/^\d+\.\d+\.\d+$/.test(pkg.version) ||
        typeof pkg.license !== "string"
    )
        throw new Error("Dependency metadata must include its name, exact version and license.");
    const hash = createHash("sha256");
    async function visit(directory: string) {
        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries.sort((a, b) =>
            a.name < b.name ? -1 : a.name > b.name ? 1 : 0
        )) {
            if (entry.name === "node_modules" && entry.isDirectory()) continue;
            if (entry.isSymbolicLink())
                throw new Error(`Dependency contains a symlink: ${entry.name}.`);
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) await visit(file);
            else if (entry.isFile()) {
                hash.update(path.relative(root, file).split(path.sep).join("/") + "\0");
                const bytes = await readFile(file);
                hash.update(String(bytes.byteLength) + "\0");
                hash.update(bytes);
            } else throw new Error(`Dependency contains a non-regular file: ${file}.`);
        }
    }
    await visit(root);
    return { ...pkg, filesSha256: hash.digest("hex") };
}

async function installedPackage(name: string, from: string) {
    for (let directory = from; ; directory = path.dirname(directory)) {
        const target = path.join(directory, "node_modules", name);
        try {
            const info = await lstat(target);
            if (info.isSymbolicLink() || !info.isDirectory())
                throw new Error(
                    `Reviewed dependencies must be installed registry packages: ${name}.`
                );
            return await realpath(target);
        } catch (error) {
            if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
                throw error;
        }
        if (path.dirname(directory) === directory) break;
    }
    throw new Error(
        `Reviewed dependency is not installed: ${name}. Use a locked, script-free install.`
    );
}
async function verifyLock(root: string, review: DependencyReview) {
    for (let directory = path.dirname(root); ; directory = path.dirname(directory)) {
        const file = path.join(directory, "package-lock.json");
        let contents: string;
        try {
            contents = await readFile(file, "utf8");
        } catch (error) {
            if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
                throw error;
            if (path.dirname(directory) === directory) break;
            continue;
        }
        const lock: {
            packages?: Record<
                string,
                {
                    version?: string;
                    integrity?: string;
                    resolved?: string;
                    link?: boolean;
                    hasInstallScript?: boolean;
                }
            >;
        } = JSON.parse(contents);
        const entry = lock.packages?.[path.relative(directory, root).split(path.sep).join("/")];
        if (
            entry?.version !== review.version ||
            entry.integrity !== review.integrity ||
            entry.link ||
            entry.hasInstallScript ||
            !entry.resolved?.startsWith("https://registry.npmjs.org/")
        )
            throw new Error(
                `Dependency lock does not match its reviewed registry archive: ${review.name}.`
            );
        return;
    }
    throw new Error(`A package-lock.json is required for reviewed dependency ${review.name}.`);
}

export async function verifyDependencies(
    root: string,
    pkg: {
        dependencies: Record<string, string>;
        peerDependencies: Record<string, string>;
        devDependencies: Record<string, string>;
        scripts: Record<string, string>;
    },
    policy: readonly DependencyReview[] = approvedDependencies
) {
    if (lifecycle.some((script) => script in pkg.scripts))
        throw new Error("Extension lifecycle installation scripts are not allowed.");
    for (const [name, version] of Object.entries(pkg.devDependencies))
        if (name !== "@edhspace/devkit" || !semver.test(version))
            throw new Error(`Unreviewed extension development dependency: ${name}.`);
    const verified = new Map<string, VerifiedDependency>();
    async function verify(name: string, version: string, from: string) {
        const review = policy.find((entry) => entry.name === name && entry.version === version);
        if (
            !review ||
            !/^(?:@[a-z0-9.-]+\/)?[a-z0-9][a-z0-9.-]*$/.test(name) ||
            !/^\d+\.\d+\.\d+$/.test(version) ||
            !/^[a-f0-9]{64}$/.test(review.filesSha256) ||
            !/^sha512-[A-Za-z0-9+/]{86}==$/.test(review.integrity) ||
            !review.review.startsWith("https://github.com/EDHspace/extensions/") ||
            !review.licenseFiles.length ||
            review.imports.some((entry) => entry !== name && !entry.startsWith(name + "/"))
        )
            throw new Error(
                `Unreviewed extension dependency: ${name}@${version}. Request maintainer review.`
            );
        const directory = await installedPackage(name, from);
        if (verified.has(directory)) return;
        const installed = await inspectDependency(directory);
        if (
            installed.name !== name ||
            installed.version !== version ||
            installed.license !== review.license ||
            installed.filesSha256 !== review.filesSha256
        )
            throw new Error(
                `Installed dependency differs from its reviewed files: ${name}@${version}.`
            );
        if (lifecycle.some((script) => script in (installed.scripts ?? {})))
            throw new Error(`Dependency lifecycle installation scripts are not allowed: ${name}.`);
        if (installed.bin) throw new Error(`Dependency executable bins are not allowed: ${name}.`);
        await verifyLock(directory, review);
        for (const file of review.licenseFiles) {
            const resolved = await realpath(path.join(directory, file));
            if (!resolved.startsWith(directory + path.sep) || !(await lstat(resolved)).isFile())
                throw new Error(`Dependency license file escapes its package: ${name}/${file}.`);
        }
        verified.set(directory, { root: directory, review });
        const dependencies = {
            ...installed.dependencies,
            ...installed.optionalDependencies,
            ...installed.peerDependencies,
        };
        const names = Object.keys(dependencies)
            .filter((name) => !official.includes(name))
            .sort();
        if (names.join("\0") !== Object.keys(review.dependencies).sort().join("\0"))
            throw new Error(`Dependency graph differs from its review: ${name}.`);
        for (const dependency of names)
            await verify(dependency, review.dependencies[dependency], directory);
    }
    for (const [name, version] of Object.entries({
        ...pkg.dependencies,
        ...pkg.peerDependencies,
    })) {
        if (official.includes(name)) {
            if (!semver.test(version))
                throw new Error(
                    "Extension dependencies must use reviewed semver, not URLs, files or Git."
                );
        } else await verify(name, version, root);
    }
    return [...verified.values()];
}

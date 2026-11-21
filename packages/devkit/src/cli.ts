#!/usr/bin/env node
import { buildExtension, validateExtension } from "./build";
import { devExtension } from "./dev";
import { readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { inspectDependency } from "./dependencies";

const [command, directory] = process.argv.slice(2);
try {
    if (
        !directory ||
        !["build", "check", "dev", "build-all", "check-all", "inspect-dependency"].includes(command)
    )
        throw new Error(
            "Usage: edhspace <check|build|dev> <extension-directory>, <check-all|build-all> <extensions-directory>, or inspect-dependency <installed-package-directory>"
        );
    if (command === "inspect-dependency")
        console.log(JSON.stringify(await inspectDependency(directory), null, 2));
    else if (command === "dev") await devExtension(directory);
    else {
        let directories = [directory];
        if (command.endsWith("-all")) {
            const root = await realpath(directory);
            const entries = await readdir(root, { withFileTypes: true });
            if (entries.some((entry) => entry.isSymbolicLink()))
                throw new Error("Extension directories cannot be symlinks.");
            directories = entries
                .filter((entry) => entry.isDirectory())
                .map((entry) => path.join(root, entry.name))
                .sort();
            if (!directories.length) throw new Error("No extension directories found.");
        }
        for (const extension of directories) {
            const result = command.startsWith("build")
                ? await buildExtension(extension)
                : await validateExtension(extension);
            console.log(`${command}: ${result.pkg.name} v${result.pkg.version}`);
        }
    }
} catch (error) {
    console.error("EDHspace extension command failed.", error);
    process.exitCode = 1;
}

import { z } from "zod";
import {
    apiVersion,
    extensionManifestSchema,
    permissionSchema,
    preferenceSchema,
    networkEndpointSchema,
} from "./contracts";

const label = z.string().trim().min(1).max(300);
const relativeFile = z
    .string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/)
    .refine(
        (value) => !value.includes("..") && !value.includes("//"),
        "Paths must stay inside the extension."
    );
const panel = z.strictObject({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,49}$/),
    title: label,
    entry: relativeFile.refine((value) => value.endsWith(".tsx")),
    location: z.enum(["workspace", "sidebar"]).default("workspace"),
});
export const extensionPackageSchema = z
    .object({
        name: z.string().regex(/^@edhspace-extension\/[a-z0-9][a-z0-9-]{0,49}$/),
        version: z.string().regex(/^\d+\.\d+\.\d+$/),
        type: z.literal("module"),
        title: label,
        description: z.string().min(1).max(1000),
        author: label,
        icon: relativeFile.refine((value) => /\.(svg|png)$/.test(value)),
        apiVersion: z.literal(apiVersion),
        permissions: z.array(permissionSchema),
        panels: z.array(panel).min(1).max(6),
        commands: z
            .array(
                z.strictObject({
                    id: panel.shape.id,
                    title: label,
                    entry: relativeFile.refine((value) => value.endsWith(".ts")),
                })
            )
            .max(6)
            .default([]),
        preferences: z.array(preferenceSchema).max(20).default([]),
        network: z.array(networkEndpointSchema).max(8).default([]),
        dependencies: z.record(z.string(), z.string()).default({}),
        peerDependencies: z.record(z.string(), z.string()).default({}),
        devDependencies: z.record(z.string(), z.string()).default({}),
        scripts: z.record(z.string(), z.string()).default({}),
        bin: z.undefined({ error: "Executable bins are not allowed in extensions." }).optional(),
        exports: z.strictObject({
            ".": z.strictObject({ types: z.literal("./dist/index.d.ts"), import: z.string() }),
            "./package.json": z.literal("./package.json"),
        }),
    })
    .refine(
        (pkg) =>
            pkg.panels[0].entry === "src/index.tsx" &&
            pkg.exports["."].import === `./dist/${pkg.panels[0].id}.js`,
        "The primary panel must use src/index.tsx and export its generated dist artifact."
    )
    .refine((pkg) => {
        const ids = [...pkg.panels, ...pkg.commands].map((entry) => entry.id);
        return new Set(ids).size === ids.length;
    }, "Panel and command IDs must be unique.");
export type ExtensionPackage = z.infer<typeof extensionPackageSchema>;
export function toExtensionManifest(value: unknown) {
    const pkg = extensionPackageSchema.parse(value);
    return extensionManifestSchema.parse({
        id: pkg.name.slice(1).replace("/", "."),
        apiVersion: pkg.apiVersion,
        version: pkg.version,
        title: pkg.title,
        description: pkg.description,
        author: pkg.author,
        permissions: pkg.permissions,
        preferences: pkg.preferences,
        panels: pkg.panels.map(({ id, title, location }) => ({ id, title, location })),
        commands: pkg.commands.map(({ id, title }) => ({ id, title })),
        network: pkg.network,
    });
}

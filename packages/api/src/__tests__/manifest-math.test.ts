import { expect, it } from "vitest";
import { extensionPackageSchema, toExtensionManifest } from "../manifest";
import { drawProbability, manaCurve } from "../math";
const pkg = {
    name: "@edhspace-extension/mana-curve",
    version: "0.1.0",
    type: "module",
    title: "Calculator",
    description: "Draw calculator",
    author: "Test",
    apiVersion: 1,
    icon: "assets/icon.svg",
    permissions: ["deck.read"],
    panels: [{ id: "mana-curve", title: "Calculator", entry: "src/index.tsx" }],
    exports: {
        ".": { types: "./dist/index.d.ts", import: "./dist/mana-curve.js" },
        "./package.json": "./package.json",
    },
};
it("validates the contribution manifest and rejects duplicate or escaping definitions", () => {
    expect(toExtensionManifest(pkg).id).toBe("edhspace-extension.mana-curve");
    expect(() =>
        toExtensionManifest({ ...pkg, permissions: ["deck.read", "deck.read"] })
    ).toThrow();
    expect(extensionPackageSchema.safeParse({ ...pkg, icon: "../secret.svg" }).success).toBe(false);
    expect(() => toExtensionManifest({ ...pkg, panels: [...pkg.panels, ...pkg.panels] })).toThrow();
    expect(() =>
        toExtensionManifest({
            ...pkg,
            preferences: [
                {
                    id: "view",
                    title: "View",
                    type: "select",
                    default: "missing",
                    options: [{ value: "list", label: "List" }],
                },
            ],
        })
    ).toThrow();
});
it("calculates known probabilities and reports invalid models explicitly", () => {
    expect(drawProbability({ population: 100, successes: 38, draws: 7, atLeast: 2 })).toBeCloseTo(
        0.8233,
        3
    );
    expect(drawProbability({ population: 99, successes: 0, draws: 7, atLeast: 1 })).toBe(0);
    expect(() => drawProbability({ population: 99, successes: 100, draws: 7, atLeast: 1 })).toThrow(
        RangeError
    );
    expect(() =>
        drawProbability({ population: 99, successes: 38, draws: NaN, atLeast: 1 })
    ).toThrow(RangeError);
});
it("plots quantities, unknown mana values and spell-front MDFCs but excludes commanders and land fronts", () => {
    expect(
        manaCurve([
            { id: "cmd", name: "Commander", quantity: 1, manaValue: 5, commander: true },
            { id: "land", name: "Land", quantity: 38, manaValue: 0, typeLine: "Basic Land" },
            { id: "spell", name: "Spell", quantity: 2, manaValue: 3, typeLine: "Sorcery // Land" },
            { id: "big", name: "Big spell", quantity: 1, manaValue: 9 },
            { id: "unknown", name: "Unknown", quantity: 1 },
        ])
    ).toEqual([
        { manaValue: "3", count: 2 },
        { manaValue: "7+", count: 1 },
        { manaValue: "Unknown", count: 1 },
    ]);
});

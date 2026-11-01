import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CHAOS-12393 (CHAOS-12378 part C0): what the ask-dev git dependency must keep true. ask-dev lists
 * react, react-dom and next as dependencies, not peers, so a pin bump or a web bump can install a
 * second copy. Two Reacts break hooks at run time, and nothing else in the suite would see it
 * before a page imports the package.
 */
const ROOT = process.cwd();
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
};
const lockfile = readFileSync(join(ROOT, "pnpm-lock.yaml"), "utf8");
const SPEC = pkg.dependencies["@full-chaos/ask-dev"];

const fromWeb = createRequire(join(ROOT, "package.json"));
const fromPackage = createRequire(
    realpathSync(join(ROOT, "node_modules/@full-chaos/ask-dev/package.json")),
);

/** The versions of a package in the lockfile's `packages:` section. */
function versionsOf(name: string): string[] {
    const section = lockfile.slice(lockfile.indexOf("\npackages:\n"));
    const end = section.indexOf("\nsnapshots:\n");
    const found = section.slice(0, end).matchAll(new RegExp(`^ {2}'?${name}@([^:'(]+)'?:$`, "gmu"));
    return [...found].map((match) => match[1]!);
}

describe("the ask-dev git dependency (CHAOS-12393)", () => {
    it("is pinned to a full commit SHA", () => {
        expect(SPEC).toMatch(/^github:full-chaos\/ask-dev#[0-9a-f]{40}$/u);
    });

    it("is the same commit in the lockfile", () => {
        const sha = SPEC!.split("#")[1]!;
        expect(lockfile).toContain(`codeload.github.com/full-chaos/ask-dev/tar.gz/${sha}`);
        const pinned = [...lockfile.matchAll(/ask-dev\/tar\.gz\/([0-9a-f]{40})/gu)].map(
            (match) => match[1],
        );
        expect(new Set(pinned)).toEqual(new Set([sha]));
    });

    it("the lockfile holds an integrity hash for it (a changed tarball fails the install)", () => {
        expect(lockfile).toMatch(
            /'@full-chaos\/ask-dev@https:[^\n]+':\n\s+resolution: \{[^\n]*integrity: sha512-/u,
        );
    });

    it.each(["react", "react-dom", "next"])("the lockfile holds one version of %s", (name) => {
        expect(versionsOf(name)).toHaveLength(1);
    });

    it.each(["react", "react/jsx-runtime", "react-dom", "react-dom/client", "next/package.json"])(
        "the package and web resolve the same file for %s",
        (name) => {
            expect(realpathSync(fromPackage.resolve(name))).toBe(
                realpathSync(fromWeb.resolve(name)),
            );
        },
    );

    it("web's Next compiles the package's source", () => {
        const config = readFileSync(join(ROOT, "next.config.js"), "utf8");
        expect(config).toMatch(/transpilePackages: \["@full-chaos\/ask-dev"\]/u);
    });

    it("the install-telemetry script of its Workbench dependency stays denied", () => {
        const workspace = readFileSync(join(ROOT, "pnpm-workspace.yaml"), "utf8");
        expect(workspace).toMatch(/^ {4}"@openuidev\/lang-core": false$/mu);
    });
});

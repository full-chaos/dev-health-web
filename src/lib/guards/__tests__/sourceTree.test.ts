/**
 * CHAOS-8258: a source scan must not fail when another test worker writes and deletes a file in
 * the scanned tree during the scan (the ACR lock temp file in `src/lib/acr/contracts`).
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sourceEntries, sourceFiles } from "@/test/sourceTree";

vi.mock("node:fs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:fs")>();
    return { ...actual, readdirSync: vi.fn(actual.readdirSync) };
});

const realFs = await vi.importActual<typeof import("node:fs")>("node:fs");
let root = "";

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "source-tree-"));
    mkdirSync(join(root, "lib", "acr", "contracts"), { recursive: true });
    writeFileSync(join(root, "lib", "a.ts"), "export const a = 1;\n");
    writeFileSync(join(root, "lib", "acr", "contracts", "manifest.json"), "{}\n");
});

afterEach(() => {
    vi.mocked(fs.readdirSync).mockImplementation(realFs.readdirSync);
    rmSync(root, { recursive: true, force: true });
});

/** The next listing of `dir` still names `name`, which is deleted right after it (the race). */
function deleteRightAfterListing(dir: string, name: string) {
    const target = join(dir, name);
    writeFileSync(target, "contender\n");
    vi.mocked(fs.readdirSync).mockImplementation(((path: fs.PathLike, options?: unknown) => {
        const listing = realFs.readdirSync(path, options as undefined);
        if (String(path) === dir && realFs.existsSync(target)) rmSync(target);
        return listing;
    }) as typeof fs.readdirSync);
}

describe("sourceTree", () => {
    it("lists every file under a tree, depth first, without dot-entries", () => {
        writeFileSync(join(root, "lib", ".DS_Store"), "");
        expect(sourceFiles(root).map((path) => path.slice(root.length))).toEqual([
            "/lib/a.ts",
            "/lib/acr/contracts/manifest.json",
        ]);
        expect(sourceEntries(join(root, "lib")).map((entry) => entry.name)).toEqual([
            "a.ts",
            "acr",
        ]);
    });

    it("does not fail when a dot-tmp lock file is created and deleted during the scan", () => {
        const contracts = join(root, "lib", "acr", "contracts");
        deleteRightAfterListing(contracts, `.acr-contract-sync.lock.${crypto.randomUUID()}.tmp`);
        // The old walk (readdirSync + statSync) throws ENOENT here.
        expect(sourceFiles(root).map((path) => path.slice(root.length))).toEqual([
            "/lib/a.ts",
            "/lib/acr/contracts/manifest.json",
        ]);
    });

    it("skips any entry that is gone by the time it is stat'ed (not only dot-files)", () => {
        deleteRightAfterListing(join(root, "lib"), "gone.ts");
        expect(sourceEntries(join(root, "lib")).map((entry) => entry.name)).toEqual([
            "a.ts",
            "acr",
        ]);
    });

    it("still fails loudly on any other stat error (a symlink loop)", () => {
        symlinkSync("loop", join(root, "lib", "loop"));
        expect(() => sourceFiles(root)).toThrow(/ELOOP/u);
    });

    it("still fails loudly when the tree itself cannot be read", () => {
        expect(() => sourceFiles(join(root, "missing"))).toThrow(/ENOENT/u);
    });
});

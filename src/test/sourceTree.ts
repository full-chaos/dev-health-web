import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Directory listing for the source-scan tests (CHAOS-8258).
 *
 * Other test workers write and delete files inside `src/` while a scan runs: the ACR contract
 * sync script takes its lock in `src/lib/acr/contracts` (`.acr-contract-sync.lock` and
 * `.acr-contract-sync.lock.<uuid>.tmp`, see `scripts/acr-contract-filesystem.mjs`), and its
 * tests run that script in parallel with everything else. A plain `readdirSync` + `statSync`
 * walk can list such a file and then fail with ENOENT when it stats it a moment later.
 *
 * So a scan lists with these helpers:
 * - dot-entries are never returned (lock, temp and editor files; no source file is a dot-file);
 * - an entry that is gone by the time it is stat'ed is skipped (ENOENT only; every other error
 *   still throws, so a scan that cannot read the tree fails loudly).
 */
export type SourceEntry = {
    name: string;
    path: string;
    isDirectory: boolean;
};

/** The entries of `dir` a source scan looks at, in listing order (see the module note). */
export function sourceEntries(dir: string): SourceEntry[] {
    return readdirSync(dir).flatMap((name) => {
        if (name.startsWith(".")) return [];
        const path = join(dir, name);
        try {
            return [{ name, path, isDirectory: statSync(path).isDirectory() }];
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
            throw error;
        }
    });
}

/** Every file under `dir`, depth first, as absolute paths (see the module note). */
export function sourceFiles(dir: string): string[] {
    return sourceEntries(dir).flatMap((entry) =>
        entry.isDirectory ? sourceFiles(entry.path) : [entry.path],
    );
}

import path from "node:path";

/**
 * `fs.cpSync` filter that keeps an isolated fixture free of another process's
 * in-flight lock state (CHAOS-3341).
 *
 * The committed `src/lib/acr/contracts` is a live lock directory during a unit
 * run: `sync-acr-contracts.test.mjs` shells out to the real
 * `scripts/sync-acr-contracts.mjs` against it, and that script takes its lease
 * by writing `.acr-contract-sync.lock.<uuid>.tmp` into the same directory and
 * hard-linking it onto `.acr-contract-sync.lock`. Vitest runs the two script
 * test files in parallel workers, so a fixture copy taken during that window
 * captured a contender temp file that no test in the copying file ever
 * created — and `acr-contract-artifacts.test.mjs` then failed asserting the
 * lock family had left nothing behind. Deleting `.acr-contract-sync.lock`
 * after the copy, the previous defence, sees neither the `.tmp` nor the
 * `.recovery` members of that family.
 *
 * Filtering during the copy rather than cleaning up after it also avoids
 * duplicating a half-written lock file into the fixture.
 */
export function isNotLockState(source) {
    return !path.basename(source).startsWith(".acr-contract-sync.lock");
}

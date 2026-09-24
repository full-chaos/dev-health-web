import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    OPERATION_MANIFEST,
    QUERY_ROUTE_PATHS,
    REGISTRYDUMP_PATHS,
    compareRegistry,
    resolveOpsPath,
    sha256Trim,
    wireForm,
} from "../graphql-wire-parity.ts";

/**
 * CHAOS-4696 evidence bar: "Assert both directions: a gate that passes
 * when all 12 are broken proves nothing. Show it catching a deliberately
 * mutated const." These tests exercise `compareRegistry` directly (the
 * pure comparison function `check`/`generate` both build on) against
 * synthetic Go-registry rows, so they run without a Go toolchain or an
 * ops checkout.
 */

/** Builds a Go-registry-shaped row set whose digests are CORRECT for
 * every manifested operation, by computing them the same way the real
 * gate does (the real, pinned @urql/core wireForm). This is the fixture
 * every test below mutates away from. */
function correctGoEntries() {
    return Object.entries(OPERATION_MANIFEST).map(([operation, sourceText]) => ({
        operation,
        document: sourceText,
        const_name: `registered${operation}Document`,
        digest: sha256Trim(wireForm(sourceText)),
    }));
}

describe("compareRegistry", () => {
    it("reports every manifested operation as MATCH when Go digests are correct", () => {
        const { rows, errors } = compareRegistry(correctGoEntries(), OPERATION_MANIFEST);
        expect(errors).toEqual([]);
        expect(rows).toHaveLength(Object.keys(OPERATION_MANIFEST).length);
        for (const row of rows) {
            expect(row.match, `${row.operation} should match`).toBe(true);
        }
    });

    it("catches a deliberately mutated Go const digest (positive control)", () => {
        const entries = correctGoEntries();
        const target = entries.find((e) => e.operation === "featureFlags");
        // Simulate exactly CHAOS-4696's defect: the Go const reverts to
        // the raw (unprinted) source digest instead of the wire digest.
        target.digest = sha256Trim(OPERATION_MANIFEST.featureFlags);

        const { rows } = compareRegistry(entries, OPERATION_MANIFEST);
        const featureFlagsRow = rows.find((r) => r.operation === "featureFlags");
        expect(featureFlagsRow.match).toBe(false);

        // Every OTHER operation must still report MATCH -- proves the
        // gate isolates the mutated operation rather than failing (or
        // passing) globally.
        for (const row of rows) {
            if (row.operation === "featureFlags") continue;
            expect(row.match, `${row.operation} should be unaffected`).toBe(true);
        }
    });

    it("catches EVERY document mismatching at once (not just the first)", () => {
        const entries = correctGoEntries().map((e) => ({ ...e, digest: "0".repeat(64) }));
        const { rows } = compareRegistry(entries, OPERATION_MANIFEST);
        expect(rows.every((r) => !r.match)).toBe(true);
        expect(rows).toHaveLength(Object.keys(OPERATION_MANIFEST).length);
    });

    it("reports a loud error when Go registers an operation with no manifest entry (silent-skip guard)", () => {
        const entries = correctGoEntries();
        entries.push({
            operation: "somethingNew",
            document: "query SomethingNew { somethingNew }",
            const_name: "registeredSomethingNewDocument",
            digest: sha256Trim("query SomethingNew { somethingNew }"),
        });
        const { errors } = compareRegistry(entries, OPERATION_MANIFEST);
        expect(errors.some((e) => e.includes("somethingNew"))).toBe(true);
    });

    it("reports a loud error when the manifest names an operation Go does not register", () => {
        const entries = correctGoEntries().filter((e) => e.operation !== "featureFlags");
        const { errors } = compareRegistry(entries, OPERATION_MANIFEST);
        expect(errors.some((e) => e.includes("featureFlags"))).toBe(true);
    });

    it.each(["toString", "constructor", "hasOwnProperty", "__proto__", "valueOf"])(
        "reports an ops operation named %s as having no manifest entry (own-property membership)",
        (operation) => {
            const entry = {
                operation,
                document: `query ${operation} { x }`,
                const_name: "registeredInheritedNameDocument",
                digest: sha256Trim(`query ${operation} { x }`),
            };
            const { errors } = compareRegistry([entry], {});
            expect(errors.some((e) => e.includes(operation))).toBe(true);
        },
    );

    it("has no tolerance for a manifest-only operation: it is an error, whatever a caller passes", () => {
        const entries = correctGoEntries().filter((e) => e.operation !== "featureFlags");
        // A stale caller still passing the removed option must not soften the result.
        const result = compareRegistry(entries, OPERATION_MANIFEST, {
            tolerateManifestOnly: true,
        });
        expect(result.errors.some((e) => e.includes("featureFlags"))).toBe(true);
        expect(Object.keys(result)).toEqual(["rows", "errors"]);
    });

    /**
     * Regression: caught live in dev-health-web#905's first CI run against
     * dev-health-ops main BEFORE the companion ops PR merged (an expected,
     * one-time bootstrap state — see both PRs' bodies) — an older
     * registrydump that predates CHAOS-4696's `digest` field returns rows
     * with `digest: undefined`. `check` mode's table-printing code called
     * `r.goDigest.slice(...)` on that `undefined` and crashed with a raw
     * TypeError instead of a readable gate failure. `compareRegistry` must
     * never hand back a row whose `goDigest` isn't a real string.
     */
    it("reports a loud, named error instead of crashing when a Go entry has no digest field", () => {
        const entries = correctGoEntries().map((e) =>
            e.operation === "featureFlags" ? { ...e, digest: undefined } : e,
        );
        const { rows, errors } = compareRegistry(entries, OPERATION_MANIFEST);

        expect(
            errors.some((e) => e.includes("featureFlags") && e.includes("no digest field")),
        ).toBe(true);
        // The broken operation must not produce a row at all (nothing for
        // the table-printing code to call .slice() on) -- every OTHER
        // operation still gets a normal row.
        expect(rows.find((r) => r.operation === "featureFlags")).toBeUndefined();
        expect(rows).toHaveLength(Object.keys(OPERATION_MANIFEST).length - 1);
        for (const row of rows) {
            expect(typeof row.goDigest).toBe("string");
        }
    });
});

describe("wireForm", () => {
    it("reproduces CHAOS-4696's own reported print()-only wire digest as an intermediate (regression pin)", () => {
        // This is the digest CHAOS-4696 itself reported for featureFlags
        // BEFORE this lane discovered cacheExchange's __typename
        // injection is also part of the real wire form. Pinning it here
        // (as the print-only, no-typename value) documents why it is
        // NOT what wireForm() returns today.
        const printOnlyDigest = "03f73cd35f226b53e559baf147e9af42be346a2e7401530a9165cd92fb99f7b9";
        const trueWireDigest = sha256Trim(wireForm(OPERATION_MANIFEST.featureFlags));
        expect(trueWireDigest).not.toBe(printOnlyDigest);
        expect(trueWireDigest).toBe(
            "06ca28a0517a34c0f5a6cc25b193da7b5682bea5192ae93e5a79edc7e7742208",
        );
    });

    it("injects __typename into every non-root selection set (cacheExchange's real behavior)", () => {
        const wire = wireForm(OPERATION_MANIFEST.featureFlags);
        expect(wire).toContain("__typename");
        // featureFlags has two non-root selection sets: `flags { ... }`
        // and the root `featureFlags(...) { ... }` field selection.
        expect(wire.match(/__typename/g)).toHaveLength(2);
    });
});

describe("resolveOpsPath", () => {
    /** An ops-root stand-in holding only the given relative paths. */
    function opsRootWith(paths) {
        const root = mkdtempSync(path.join(tmpdir(), "wire-parity-ops-"));
        for (const relative of paths) {
            if (relative.endsWith(".go")) {
                mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
                writeFileSync(path.join(root, relative), "package x\n");
            } else {
                mkdirSync(path.join(root, relative), { recursive: true });
            }
        }
        return root;
    }

    it.each([
        ["after the move", [QUERY_ROUTE_PATHS[0], REGISTRYDUMP_PATHS[0]], 0],
        ["before the move", [QUERY_ROUTE_PATHS[1], REGISTRYDUMP_PATHS[1]], 1],
        ["both present", [...QUERY_ROUTE_PATHS, ...REGISTRYDUMP_PATHS], 0],
    ])("resolves each path in an ops checkout %s", (_name, present, want) => {
        const root = opsRootWith(present);
        try {
            expect(resolveOpsPath(root, QUERY_ROUTE_PATHS)).toBe(QUERY_ROUTE_PATHS[want]);
            expect(resolveOpsPath(root, REGISTRYDUMP_PATHS)).toBe(REGISTRYDUMP_PATHS[want]);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it("names every candidate when none exists", () => {
        const root = opsRootWith([]);
        try {
            expect(() => resolveOpsPath(root, QUERY_ROUTE_PATHS)).toThrow(
                QUERY_ROUTE_PATHS.join(", "),
            );
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

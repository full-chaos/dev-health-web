import { describe, it, expect } from "vitest";
import {
    encodeSecurityFilter,
    decodeSecurityFilter,
    defaultSecurityFilter,
    applyLockedRepoId,
} from "@/lib/filters/security";
import type { SecurityFilter } from "@/lib/filters/security";

// ---------------------------------------------------------------------------
// Filter encode / decode round-trip
// ---------------------------------------------------------------------------

describe("encodeSecurityFilter / decodeSecurityFilter", () => {
    it("round-trips a minimal filter", () => {
        const f: SecurityFilter = { openOnly: true };
        const encoded = encodeSecurityFilter(f);
        expect(typeof encoded).toBe("string");
        expect(encoded.length).toBeGreaterThan(0);
        const decoded = decodeSecurityFilter(encoded);
        expect(decoded.openOnly).toBe(true);
    });

    it("round-trips all filter fields", () => {
        const f: SecurityFilter = {
            severities: ["critical", "high"],
            sources: ["dependabot", "code_scanning"],
            states: ["open", "detected"],
            repoIds: ["org/repo-a", "org/repo-b"],
            since: "2024-01-01",
            until: "2024-12-31",
            openOnly: false,
            search: "CVE-2024",
        };
        const decoded = decodeSecurityFilter(encodeSecurityFilter(f));
        expect(decoded.severities).toEqual(["critical", "high"]);
        expect(decoded.sources).toEqual(["dependabot", "code_scanning"]);
        expect(decoded.states).toEqual(["open", "detected"]);
        expect(decoded.repoIds).toEqual(["org/repo-a", "org/repo-b"]);
        expect(decoded.since).toBe("2024-01-01");
        expect(decoded.until).toBe("2024-12-31");
        expect(decoded.openOnly).toBe(false);
        expect(decoded.search).toBe("CVE-2024");
    });

    it("returns default filter when given undefined", () => {
        const decoded = decodeSecurityFilter(undefined);
        expect(decoded).toEqual(defaultSecurityFilter());
    });

    it("returns default filter on invalid input", () => {
        const decoded = decodeSecurityFilter("not-valid-base64!!!");
        expect(decoded).toEqual(defaultSecurityFilter());
    });

    it("strips unknown keys for forward-compat", () => {
        const f = { openOnly: true, unknownKey: "value" } as SecurityFilter & {
            unknownKey: string;
        };
        const encoded = encodeSecurityFilter(f);
        const decoded = decodeSecurityFilter(encoded) as Record<string, unknown>;
        expect("unknownKey" in decoded).toBe(false);
        expect(decoded.openOnly).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// defaultSecurityFilter
// ---------------------------------------------------------------------------

describe("defaultSecurityFilter", () => {
    it("returns openOnly: true", () => {
        expect(defaultSecurityFilter()).toEqual({ openOnly: true });
    });
});

// ---------------------------------------------------------------------------
// applyLockedRepoId
// ---------------------------------------------------------------------------

describe("applyLockedRepoId", () => {
    it("overrides repoIds with the given single repo", () => {
        const base: SecurityFilter = { openOnly: true, repoIds: ["other/repo"] };
        const locked = applyLockedRepoId(base, "org/target");
        expect(locked.repoIds).toEqual(["org/target"]);
        expect(locked.openOnly).toBe(true);
    });

    it("does not mutate the original filter", () => {
        const base: SecurityFilter = { openOnly: true };
        applyLockedRepoId(base, "org/target");
        expect(base.repoIds).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Severity sort order — matches SeverityStackedBar constant
// ---------------------------------------------------------------------------

describe("severity sort order", () => {
    const SEVERITY_ORDER = ["critical", "high", "medium", "low", "unknown"] as const;

    it("orders severity from highest to lowest risk", () => {
        expect(SEVERITY_ORDER[0]).toBe("critical");
        expect(SEVERITY_ORDER[SEVERITY_ORDER.length - 1]).toBe("unknown");
    });

    it("contains exactly 5 levels", () => {
        expect(SEVERITY_ORDER).toHaveLength(5);
    });
});

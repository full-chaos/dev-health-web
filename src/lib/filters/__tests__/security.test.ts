import { describe, expect, it } from "vitest";

import {
  applyLockedRepoId,
  decodeSecurityFilter,
  defaultSecurityFilter,
  encodeSecurityFilter,
} from "@/lib/filters/security";
import type { SecurityFilter } from "@/lib/filters/security";

describe("defaultSecurityFilter", () => {
  it("returns { openOnly: true }", () => {
    expect(defaultSecurityFilter()).toEqual({ openOnly: true });
  });
});

describe("encodeSecurityFilter / decodeSecurityFilter round-trip", () => {
  const cases: Array<{ label: string; filter: SecurityFilter }> = [
    {
      label: "default filter",
      filter: { openOnly: true },
    },
    {
      label: "severities only",
      filter: { severities: ["critical", "high"] },
    },
    {
      label: "sources + states",
      filter: {
        sources: ["dependabot", "code_scanning"],
        states: ["open", "detected"],
      },
    },
    {
      label: "repoIds + search + date range",
      filter: {
        repoIds: ["repo-abc", "repo-def"],
        search: "lodash",
        since: "2025-01-01",
        until: "2025-12-31",
      },
    },
    {
      label: "all fields populated",
      filter: {
        severities: ["critical", "medium", "unknown"],
        sources: ["advisory", "gitlab_vulnerability", "gitlab_dependency"],
        states: ["fixed", "dismissed", "resolved"],
        repoIds: ["r1"],
        since: "2025-03-01",
        until: "2025-04-01",
        openOnly: false,
        search: "CVE-2025",
      },
    },
  ];

  for (const { label, filter } of cases) {
    it(`round-trips: ${label}`, () => {
      const encoded = encodeSecurityFilter(filter);
      const decoded = decodeSecurityFilter(encoded);
      expect(decoded).toEqual(filter);
    });
  }

  it("decodeSecurityFilter returns default when encoded is undefined", () => {
    expect(decodeSecurityFilter(undefined)).toEqual(defaultSecurityFilter());
  });

  it("decodeSecurityFilter returns default on invalid input", () => {
    expect(decodeSecurityFilter("!!!not-valid-base64!!!")).toEqual(defaultSecurityFilter());
  });
});

describe("decodeSecurityFilter — forward-compat", () => {
  it("drops unknown field keys from the encoded payload", () => {
    // Manually encode a payload with an extra unknown field
    const payloadWithExtra = { openOnly: true, unknownFutureField: "ignore-me", severities: ["critical"] };
    const encoded = btoa(JSON.stringify(payloadWithExtra))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const decoded = decodeSecurityFilter(encoded);
    expect(decoded).not.toHaveProperty("unknownFutureField");
    expect(decoded.openOnly).toBe(true);
    expect(decoded.severities).toEqual(["critical"]);
  });

  it("returns defaultSecurityFilter when all keys are foreign (e.g. a MetricFilter payload)", () => {
    // Simulate a MetricFilter-style payload that has no SecurityFilter keys
    const foreignPayload = { someUnknownKey: "x", anotherForeignKey: 42 };
    const encoded = btoa(JSON.stringify(foreignPayload))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const decoded = decodeSecurityFilter(encoded);
    expect(decoded).toEqual(defaultSecurityFilter());
    expect(decoded.openOnly).toBe(true);
  });

  it("preserves explicit { openOnly: false } without overwriting with true", () => {
    const encoded = encodeSecurityFilter({ openOnly: false });
    const decoded = decodeSecurityFilter(encoded);
    expect(decoded).toEqual({ openOnly: false });
    expect(decoded.openOnly).toBe(false);
  });

  it("decodes { severities: ['critical'] } without forcing openOnly", () => {
    const encoded = encodeSecurityFilter({ severities: ["critical"] });
    const decoded = decodeSecurityFilter(encoded);
    expect(decoded).toEqual({ severities: ["critical"] });
    expect(decoded).not.toHaveProperty("openOnly");
  });
});

describe("applyLockedRepoId", () => {
  it("sets repoIds to [repoId] on an empty filter", () => {
    const result = applyLockedRepoId({}, "repo-123");
    expect(result.repoIds).toEqual(["repo-123"]);
  });

  it("overwrites existing repoIds", () => {
    const base: SecurityFilter = { repoIds: ["old-repo", "another"], openOnly: true };
    const result = applyLockedRepoId(base, "new-repo");
    expect(result.repoIds).toEqual(["new-repo"]);
  });

  it("preserves other filter fields", () => {
    const base: SecurityFilter = {
      severities: ["high"],
      openOnly: true,
      search: "cve",
    };
    const result = applyLockedRepoId(base, "repo-xyz");
    expect(result.severities).toEqual(["high"]);
    expect(result.openOnly).toBe(true);
    expect(result.search).toBe("cve");
    expect(result.repoIds).toEqual(["repo-xyz"]);
  });

  it("does not mutate the original filter", () => {
    const base: SecurityFilter = { repoIds: ["original"] };
    applyLockedRepoId(base, "new");
    expect(base.repoIds).toEqual(["original"]);
  });
});

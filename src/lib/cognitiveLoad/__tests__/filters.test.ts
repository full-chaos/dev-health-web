import { describe, expect, it } from "vitest";

import { defaultMetricFilter } from "@/lib/filters/defaults";

import { cognitiveLoadRepoIdFromFilter } from "../filters";

describe("cognitiveLoadRepoIdFromFilter", () => {
    it("returns null when no repos are selected", () => {
        expect(cognitiveLoadRepoIdFromFilter(defaultMetricFilter)).toBeNull();
    });

    it("returns the first selected repo id when repos are present", () => {
        const filters = {
            ...defaultMetricFilter,
            what: { ...defaultMetricFilter.what, repos: ["repo-a", "repo-b"] },
        };
        expect(cognitiveLoadRepoIdFromFilter(filters)).toBe("repo-a");
    });

    it("returns null when repos is an empty array", () => {
        const filters = {
            ...defaultMetricFilter,
            what: { ...defaultMetricFilter.what, repos: [] },
        };
        expect(cognitiveLoadRepoIdFromFilter(filters)).toBeNull();
    });
});

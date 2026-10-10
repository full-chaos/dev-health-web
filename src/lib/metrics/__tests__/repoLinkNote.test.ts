import { describe, expect, it } from "vitest";

import { metricDisplay } from "@/lib/metrics/metricDisplay";
import {
    isRepoLinkNoValueState,
    repoLinkCoverageNote,
    repoLinkMultiRepoNote,
    repoLinkPageNotes,
    repoLinkTileNote,
    withRepoLinkNote,
} from "@/lib/metrics/repoLinkNote";

const linked = {
    metric: "cycle_time",
    repo_link_state: "linked",
    repo_link_basis: { native: 56, explicit_text: 7, heuristic: 32 },
    repo_link_multi_repo_items: 22,
    repo_link_coverage: { linked_items: 6527, items_in_window: 10593 },
};

describe("repoLinkTileNote", () => {
    it("names the three tiers for linked", () => {
        expect(repoLinkTileNote(linked)).toBe(
            "From issues linked to this repository's pull requests: 56 native, 7 by text, 32 by heuristic.",
        );
    });
    it("keeps a tier with 0 items and formats thousands", () => {
        expect(
            repoLinkTileNote({
                ...linked,
                repo_link_basis: { native: 0, explicit_text: 1234, heuristic: 0 },
            }),
        ).toBe(
            "From issues linked to this repository's pull requests: 0 native, 1,234 by text, 0 by heuristic.",
        );
    });
    it("draws nothing for linked with a missing tier count", () => {
        expect(
            repoLinkTileNote({ ...linked, repo_link_basis: { native: 1, explicit_text: null } }),
        ).toBeNull();
        expect(repoLinkTileNote({ ...linked, repo_link_basis: null })).toBeNull();
    });
    it.each([
        ["no_links", "No issue is linked to this repository's pull requests in this window."],
        ["timed_out", "This read took too long. No value is shown."],
        ["too_large", "Too many linked issues to read for this window. No value is shown."],
    ])("state %s", (state, text) => {
        expect(repoLinkTileNote({ metric: "throughput", repo_link_state: state })).toBe(text);
    });
    it("draws nothing for null, unknown state, absent, other metric or no row", () => {
        expect(repoLinkTileNote({ metric: "cycle_time", repo_link_state: null })).toBeNull();
        expect(repoLinkTileNote({ metric: "cycle_time", repo_link_state: "future" })).toBeNull();
        expect(repoLinkTileNote({ metric: "cycle_time" })).toBeNull();
        expect(repoLinkTileNote({ ...linked, metric: "ci_success" })).toBeNull();
        expect(repoLinkTileNote(null)).toBeNull();
    });
    it("never says native for text or heuristic counts", () => {
        const text = repoLinkTileNote({
            ...linked,
            repo_link_basis: { native: 0, explicit_text: 9, heuristic: 8 },
        });
        expect(text).toContain("0 native");
        expect(text).not.toMatch(/9 native|8 native/);
    });
});

describe("page notes", () => {
    it("multi-repo note only above 0", () => {
        expect(repoLinkMultiRepoNote(linked)).toBe(
            "22 of these issues are also linked to pull requests of other repositories. Repository views do not add up to the organization total.",
        );
        expect(repoLinkMultiRepoNote({ ...linked, repo_link_multi_repo_items: 0 })).toBeNull();
        expect(repoLinkMultiRepoNote({ ...linked, repo_link_multi_repo_items: null })).toBeNull();
    });
    it("coverage note, none at T = 0", () => {
        expect(repoLinkCoverageNote(linked)).toBe(
            "6,527 of 10,593 issues in this window have a linked pull request.",
        );
        expect(
            repoLinkCoverageNote({
                ...linked,
                repo_link_coverage: { linked_items: 0, items_in_window: 0 },
            }),
        ).toBeNull();
        expect(repoLinkCoverageNote({ ...linked, repo_link_coverage: null })).toBeNull();
    });
    it("reads the first linked row of the four metrics, once", () => {
        const notes = repoLinkPageNotes([
            { metric: "cycle_time", repo_link_state: "timed_out" },
            linked,
            { ...linked, metric: "throughput" },
        ]);
        expect(notes).toHaveLength(2);
        expect(repoLinkPageNotes([{ metric: "cycle_time", repo_link_state: "no_links" }])).toEqual(
            [],
        );
        expect(repoLinkPageNotes(null)).toEqual([]);
    });
});

describe("withRepoLinkNote", () => {
    it("appends with a dot or keeps the caption", () => {
        expect(withRepoLinkNote("x", { metric: "cycle_time", repo_link_state: "timed_out" })).toBe(
            "x · This read took too long. No value is shown.",
        );
        expect(withRepoLinkNote(undefined, linked)).toMatch(/^From issues/);
        expect(withRepoLinkNote("x", { metric: "cycle_time" })).toBe("x");
    });
});

describe("no-value states (contradiction guard)", () => {
    it.each(["no_links", "timed_out", "too_large"])(
        "%s is no data even with has_data true",
        (state) => {
            expect(isRepoLinkNoValueState(state)).toBe(true);
            expect(
                metricDisplay({ has_data: true, has_prior_data: true, repo_link_state: state })
                    .state,
            ).toBe("no-data");
        },
    );
    it("linked, null and unknown keep data", () => {
        for (const state of ["linked", null, undefined, "future"]) {
            expect(isRepoLinkNoValueState(state)).toBe(false);
            expect(
                metricDisplay({ has_data: true, has_prior_data: true, repo_link_state: state })
                    .state,
            ).toBe("measured");
        }
    });
});

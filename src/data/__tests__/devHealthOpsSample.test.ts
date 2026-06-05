import { describe, expect, it } from "vitest";

import {
    sampleChordRepoTransfer,
    sampleChordTeamReviewLoad,
    sampleChordWorkTypeRework,
} from "@/data/devHealthOpsSample";
import { buildChordDataset } from "@/lib/chord";

describe("sampleChordTeamReviewLoad", () => {
    it("contains at least 15 records", () => {
        expect(sampleChordTeamReviewLoad.length).toBeGreaterThanOrEqual(15);
    });

    it("covers exactly 12 distinct team names across source/target", () => {
        const ids = new Set<string>();
        for (const record of sampleChordTeamReviewLoad) {
            ids.add(record.source);
            ids.add(record.target);
        }
        expect(ids.size).toBe(12);
    });

    it("has all positive values", () => {
        for (const record of sampleChordTeamReviewLoad) {
            expect(record.value).toBeGreaterThan(0);
        }
    });

    it("triggers the Other bucket at topN=8", () => {
        const dataset = buildChordDataset(sampleChordTeamReviewLoad, {
            topN: 8,
            grouping: "team",
        });
        expect(dataset.summary.otherShare).toBeGreaterThan(0);
    });
});

describe("sampleChordRepoTransfer", () => {
    it("has exactly 6 distinct repo names", () => {
        const ids = new Set<string>();
        for (const record of sampleChordRepoTransfer) {
            ids.add(record.source);
            ids.add(record.target);
        }
        expect(ids.size).toBe(6);
    });

    it("contains no self-links", () => {
        for (const record of sampleChordRepoTransfer) {
            expect(record.source).not.toBe(record.target);
        }
    });

    it("has all positive values", () => {
        for (const record of sampleChordRepoTransfer) {
            expect(record.value).toBeGreaterThan(0);
        }
    });

    it("does NOT trigger the Other bucket at topN=8 (6 nodes)", () => {
        const dataset = buildChordDataset(sampleChordRepoTransfer, {
            topN: 8,
            grouping: "repo",
        });
        expect(dataset.summary.otherShare).toBe(0);
    });
});

describe("sampleChordWorkTypeRework", () => {
    it("contains at least 3 self-links", () => {
        const selfLinks = sampleChordWorkTypeRework.filter(
            (record) => record.source === record.target,
        );
        expect(selfLinks.length).toBeGreaterThanOrEqual(3);
    });

    it("has all positive values", () => {
        for (const record of sampleChordWorkTypeRework) {
            expect(record.value).toBeGreaterThan(0);
        }
    });
});

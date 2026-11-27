import { describe, expect, it } from "vitest";

import { aiReviewLoadResponse } from "./aiSample";

describe("aiReviewLoadResponse (the shape ops serves)", () => {
    it("serves a day on every populated daily row, one row per (bucket, day)", () => {
        const { daily } = aiReviewLoadResponse("org", "2026-04-20", "2026-05-19", "populated");
        expect(daily.length).toBeGreaterThan(0);
        for (const row of daily) {
            expect((row as { day?: string }).day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
        const keys = daily.map((row) => `${row.bucket}|${(row as { day?: string }).day}`);
        expect(new Set(keys).size).toBe(keys.length);
        expect(new Set(daily.map((row) => row.bucket)).size).toBe(2);
    });

    it("keeps the empty and missing modes without daily rows", () => {
        expect(aiReviewLoadResponse("org", "a", "b", "empty").daily).toEqual([]);
        expect(aiReviewLoadResponse("org", "a", "b", "missing").daily).toEqual([]);
    });
});

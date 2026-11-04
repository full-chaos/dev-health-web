import { describe, expect, it } from "vitest";

import { framesOf, longestSilenceMs, seqMismatches } from "../../tests/live/ask-dev/reattach-views";

const event = (seq: number, type: string) =>
    `id: ${String(seq)}\nevent: ${type}\ndata: ${JSON.stringify({ type, seq })}\n\n`;

describe("framesOf: an investigation stream's events and comments (CHAOS-12233)", () => {
    it("reads each event's seq and type, and each comment, in order", () => {
        const body = `${event(1, "accepted")}: keepalive\n\n${event(2, "stage")}`;
        expect(framesOf(body)).toEqual([
            { seq: 1, type: "accepted" },
            { comment: "keepalive" },
            { seq: 2, type: "stage" },
        ]);
    });

    it("keeps a frame whose data is not JSON as having no seq, never a guessed one", () => {
        expect(framesOf("data: not json\n\n")).toEqual([{}]);
    });
});

describe("seqMismatches: an attach resumes the events with no gap (AC-5)", () => {
    it("finds nothing when the attach starts after the cursor and both run on, one by one", () => {
        expect(seqMismatches([1, 2, 3], [4, 5, 6, 7], 3)).toEqual([]);
        expect(seqMismatches([], [1, 2, 3], null)).toEqual([]);
    });

    it("reports a gap, a repeat and a start that is not the cursor's next", () => {
        expect(seqMismatches([1, 2, 3], [4, 6, 7], 3)).toEqual(["attach: seq 6 after 4"]);
        expect(seqMismatches([1, 2, 3], [5, 6], 3)).toEqual([
            "attach: starts at seq 5, the cursor was 3",
        ]);
        expect(seqMismatches([1, 2, 2], [3], 2)).toEqual(["create: seq 2 after 2"]);
        expect(seqMismatches([1, 2, 3], [4], 2)).toEqual([
            "the cursor 2 is not the last seq the create stream gave (3)",
            "attach: starts at seq 4, the cursor was 2",
        ]);
    });

    it("reports an attach with no events: nothing was resumed", () => {
        expect(seqMismatches([1, 2], [], 2)).toEqual(["attach: no event"]);
    });
});

describe("longestSilenceMs: the longest time with no byte, to the end (AC-7)", () => {
    it("measures between chunks, and from the last chunk to the end", () => {
        const chunks = [
            { at: 1_000, text: "a" },
            { at: 9_000, text: ": keepalive\n\n" },
            { at: 19_500, text: ": keepalive\n\n" },
        ];
        expect(longestSilenceMs(chunks, 21_000)).toBe(10_500);
        expect(longestSilenceMs(chunks, 40_000)).toBe(20_500);
    });

    it("is the whole time when no byte came", () => {
        expect(longestSilenceMs([], 5_000)).toBe(Number.POSITIVE_INFINITY);
    });
});

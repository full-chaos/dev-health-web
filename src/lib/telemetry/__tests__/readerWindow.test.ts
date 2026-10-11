import { describe, expect, it } from "vitest";

import { resolveReaderWindow } from "../readerWindow";

// Backend rule: occurred_at >= start AND occurred_at < end (dates, end exclusive).
const inWindow = (occurredAt: Date, w: { start: string; end: string }) =>
    occurredAt >= new Date(w.start) && occurredAt < new Date(w.end);

describe("resolveReaderWindow", () => {
    it("default window includes an event of now", () => {
        const now = new Date("2026-10-11T09:30:00Z");
        expect(inWindow(now, resolveReaderWindow({}, now))).toBe(true);
    });

    it("includes now just before the UTC day boundary", () => {
        const now = new Date("2026-10-11T23:59:59.999Z");
        const w = resolveReaderWindow({}, now);
        expect(w.end).toBe("2026-10-12");
        expect(inWindow(now, w)).toBe(true);
    });

    it("includes now just after the UTC day boundary", () => {
        const now = new Date("2026-10-12T00:00:00.000Z");
        const w = resolveReaderWindow({}, now);
        expect(w.end).toBe("2026-10-13");
        expect(inWindow(now, w)).toBe(true);
    });

    it("keeps the start 30 days before today", () => {
        const now = new Date("2026-10-11T09:30:00Z");
        expect(resolveReaderWindow({}, now).start).toBe("2026-09-11");
    });

    it("passes explicit dates through unchanged", () => {
        const now = new Date("2026-10-11T09:30:00Z");
        expect(
            resolveReaderWindow({ startDate: "2026-01-01", endDate: "2026-02-01" }, now),
        ).toEqual({
            start: "2026-01-01",
            end: "2026-02-01",
        });
    });

    it("ignores an invalid date", () => {
        const now = new Date("2026-10-11T09:30:00Z");
        expect(resolveReaderWindow({ endDate: "nope" }, now).end).toBe("2026-10-12");
    });
});

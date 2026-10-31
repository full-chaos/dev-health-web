import { describe, expect, it } from "vitest";

import { parseThreadList } from "../threadContract";

// CHAOS-12238: the thread list's optional `first_question` (acr #1823, pinned by CHAOS-12236) reaches
// the history list view as served; absent stays absent. ACR serves it only while its switch is on.
const item = (extra: Record<string, unknown> = {}) => ({
    thread_id: "thread_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    retention_days: 30,
    turn_count: 2,
    created_at: "2026-10-30T10:00:00Z",
    last_turn_at: "2026-10-30T11:00:00Z",
    expires_at: "2026-11-29T11:00:00Z",
    ...extra,
});
const list = (...threads: Record<string, unknown>[]) => ({
    schema_version: "context_fabric_thread_list.v1",
    threads,
});

describe("parseThreadList: first_question (CHAOS-12238)", () => {
    it("maps a served first question to the view, verbatim", () => {
        const view = parseThreadList(list(item({ first_question: "Which teams are overloaded?" })));
        expect(view?.threads[0]?.firstQuestion).toBe("Which teams are overloaded?");
    });

    it("maps an absent first question to null (legacy turns, or the switch off)", () => {
        expect(parseThreadList(list(item()))?.threads[0]?.firstQuestion).toBeNull();
    });

    it("refuses a list whose first question the schema refuses", () => {
        expect(parseThreadList(list(item({ first_question: "" })))).toBeNull();
        expect(parseThreadList(list(item({ first_question: 42 })))).toBeNull();
    });
});

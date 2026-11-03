import { beforeEach, describe, expect, it, vi } from "vitest";

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: log }));

import { OMISSION_COUNTS } from "@/lib/ask-dev/projectionBudget";
import { ConversationStore } from "../conversationStore";
import {
    accepted,
    boundedFixture,
    captureResult,
    FakeTransport,
    resultEvent,
    status,
} from "./fakeTransport";

const boundedAnswer = () => boundedFixture("bounded-answer");
const boundedNoMatch = () => boundedFixture("bounded-no-match");

/**
 * CHAOS-12643: ACR's bounded answer (`context_fabric_answer_projection.v1`) is an answer the
 * render draws as itself, not a refusal. Fixtures are ACR's real projector output.
 */

const PARTIAL = captureResult("kiac_project_status_partial.event.json");
const ORG_A = "org-a\u0000user-1\u0000";

let transport: FakeTransport;
let clock: number;

function makeStore(): ConversationStore {
    let n = 0;
    const store = new ConversationStore({
        transport,
        now: () => clock,
        sleep: async (ms) => {
            clock += ms;
        },
        uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    });
    store.setPartition(ORG_A);
    return store;
}

const settled = (store: ConversationStore) =>
    vi.waitFor(() => expect(store.getSnapshot().inFlight).toBe(false));
const last = (store: ConversationStore) => store.getSnapshot().turns.at(-1)!;

/** A copy of `projection` whose budget says `truncated` with no count set: breaks ACR's rule. */
function inconsistent() {
    const projection = boundedAnswer();
    const budget = {
        ...projection.projection_budget,
        truncated: true,
        full_result_omitted: false,
        values_clamped: 0,
    };
    for (const key of OMISSION_COUNTS) budget[key] = 0;
    return { ...projection, projection_budget: budget };
}

beforeEach(() => {
    transport = new FakeTransport();
    clock = Date.parse("2026-10-30T12:00:00Z");
    vi.clearAllMocks();
});

describe("ACR's bounded answer (CHAOS-12643)", () => {
    it("settles a bounded result event as a bounded answer, as it is", async () => {
        const projection = boundedAnswer();
        const store = makeStore();
        transport.scripts.push([accepted(), resultEvent(projection)]);
        store.submit("Which teams are struggling right now, and why?");
        await settled(store);
        expect(last(store).outcome).toEqual({ kind: "bounded", projection });
    });

    it("refuses a bounded answer whose budget breaks ACR's truncated rule, never retried", async () => {
        const store = makeStore();
        transport.scripts.push([accepted(), resultEvent(inconsistent())]);
        store.submit("Which teams are struggling right now, and why?");
        await settled(store);
        expect(last(store).outcome.kind).toBe("unreadable");
        expect(transport.calls).toHaveLength(1);
    });

    it("refuses a bounded answer with no budget as unreadable, not a thrown turn", async () => {
        const { projection_budget: _dropped, ...noBudget } = boundedAnswer();
        const store = makeStore();
        transport.scripts.push([
            accepted(),
            resultEvent(noBudget as ReturnType<typeof boundedAnswer>),
        ]);
        store.submit("Which teams are struggling right now, and why?");
        await settled(store);
        expect(last(store).outcome.kind).toBe("unreadable");
        expect(transport.calls).toHaveLength(1);
    });

    it("leaves a whole result an answer", async () => {
        const store = makeStore();
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        store.submit("What is the status of the project?");
        await settled(store);
        expect(last(store).outcome).toEqual({ kind: "answered", result: PARTIAL });
    });

    it("threads the next turn on a bounded answer: parent result, its subjects and its answer", async () => {
        const projection = boundedNoMatch();
        expect(projection.committed_subjects.length).toBeGreaterThan(0);
        const store = makeStore();
        transport.scripts.push([resultEvent(projection)], [resultEvent(PARTIAL)]);
        store.submit("Which teams are struggling right now, and why?");
        await settled(store);
        store.submit("Why?");
        await settled(store);
        const second = transport.calls[1]!.request;
        expect(second.parent_result_id).toBe(projection.result_id);
        expect(second.requested_scope?.subject_hints?.map((hint) => hint.id)).toEqual(
            projection.committed_subjects.map((subject) => subject.canonical_id),
        );
        expect(second.conversation?.at(-1)).toMatchObject({
            role: "assistant",
            content: projection.deterministic_answer,
        });
    });

    it("settles a bounded answer read back after a dropped stream as bounded", async () => {
        const projection = boundedAnswer();
        const store = makeStore();
        transport.scripts.push([accepted("result_reserved_0001")]);
        transport.statuses.push(status("done", projection.result_id));
        transport.results.set(projection.result_id, projection);
        store.submit("Which teams are struggling right now, and why?");
        await settled(store);
        expect(transport.readCalls).toEqual([projection.result_id]);
        expect(last(store).outcome).toEqual({ kind: "bounded", projection });
    });
});

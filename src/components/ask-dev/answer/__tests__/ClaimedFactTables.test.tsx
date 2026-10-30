import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@/test/utils";

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn } }));

import { factsWithRows, groupFactsByTable } from "@/lib/ask-dev/facts/fact-rows";
import type { ClaimedFact } from "@/lib/ask-dev/render/contracts";
import { WINDOW_NOT_STATED } from "@/lib/ask-dev/render/window-text";
import attentionRanking from "@/lib/ask-dev/render/__oracle__/captures/kiac_repo_attention_ranking.event.json";

import { AskDevAnswer } from "../AskDevAnswer";
import type { AnswerResult } from "../answerModel";
import ciRateComplete from "./captures/kiac_repo_ci_rate_complete.event.json";
import mergedPrsDegraded from "./captures/kiac_repo_merged_prs_degraded.event.json";
import projectStatusPartial from "./captures/kiac_project_status_partial.event.json";
import teamOpenWorkDegraded from "./captures/kiac_team_open_work_degraded.event.json";

/**
 * CHAOS-11945 (I-27, E8 design §11): the claimed-fact tables of an answer. Every result is a real
 * ACR answer (scrubbed kiac captures). A test that needs a state kiac did not produce changes one
 * field of a copy of a real answer and says so.
 */
type FactResult = AnswerResult & {
    claimed_facts?: ClaimedFact[];
    effective_evidence_window?: Record<string, unknown> | null;
};
const copyOf = (event: { result: unknown }) => structuredClone(event.result) as FactResult;

const tablesPart = () => screen.getByTestId("ask-dev-answer-fact-tables");
const tables = () => within(tablesPart()).getAllByTestId("ask-dev-fact-table");
const headerKeys = (table: HTMLElement) =>
    within(table)
        .getAllByRole("columnheader")
        .map((th) => th.getAttribute("title"));
const factOf = (result: FactResult, claimId: string) => {
    const fact = result.claimed_facts?.find((candidate) => candidate.claim_id === claimId);
    if (!fact) throw new Error(`no claim ${claimId}`);
    return fact;
};
const tableFor = (claimId: string) => {
    const table = tables().find((candidate) =>
        (candidate.getAttribute("data-claim-ids") ?? "").split(" ").includes(claimId),
    );
    if (!table) throw new Error(`no table for ${claimId}`);
    return table;
};

afterEach(() => {
    warn.mockClear();
});

describe("the captures carry what each test needs", () => {
    it("has declared tables, a dual-table fact, absent cells, explicit nulls and both window cases", () => {
        const status = copyOf(projectStatusPartial);
        expect(factsWithRows(status.claimed_facts ?? [])).toHaveLength(3);
        expect(factOf(status, "claim-flow-completed").time_series_rows?.length).toBeGreaterThan(0);
        const readiness = factOf(status, "claim-readiness-estimated");
        expect(
            readiness.rows?.some((row) => row.fields.estimate_coverage_ratio === undefined),
        ).toBe(true);
        expect(status.effective_evidence_window?.relative_id).toBe("trailing_30d");
        expect(copyOf(mergedPrsDegraded).effective_evidence_window ?? null).toBeNull();
        const ranking = copyOf(attentionRanking);
        expect(
            ranking.claimed_facts?.some((fact) =>
                fact.rows?.some((row) => Object.values(row.fields).some((v) => v?.null === true)),
            ),
        ).toBe(true);
        expect(factsWithRows(copyOf(ciRateComplete).claimed_facts ?? [])).toHaveLength(0);
    });
});

describe("claimed-fact tables in the answer (CHAOS-11945)", () => {
    it("renders one table per cited table, after the findings and before the coverage", () => {
        const status = copyOf(projectStatusPartial);
        render(<AskDevAnswer result={status} />);

        const groups = groupFactsByTable(factsWithRows(status.claimed_facts ?? []));
        expect(tables()).toHaveLength(groups.length);
        const order = Array.from(
            document.querySelectorAll(
                '[data-testid="ask-dev-answer-conflicts"], [data-testid="ask-dev-answer-fact-tables"], [data-testid="ask-dev-coverage"]',
            ),
        ).map((node) => node.getAttribute("data-testid"));
        expect(order).toEqual([
            "ask-dev-answer-conflicts",
            "ask-dev-answer-fact-tables",
            "ask-dev-coverage",
        ]);
    });

    it("orders columns as declared: key, then measures, then observations; headers humanized, raw key in the title", () => {
        render(<AskDevAnswer result={copyOf(projectStatusPartial)} />);

        const workload = tableFor("claim-workload-backlog");
        // Rows list backlog_size first; the declaration puts the key `day` first.
        expect(headerKeys(workload)).toEqual([
            "day",
            "backlog_size",
            "throughput_mean",
            "throughput_stddev",
        ]);
        const header = within(workload).getAllByRole("columnheader")[1]!;
        expect(header).toHaveTextContent("backlog size (measure)");
        expect(header).toHaveAttribute("data-role", "measure");
        expect(within(workload).getAllByRole("columnheader")[0]).not.toHaveAttribute(
            "data-role",
            "measure",
        );
    });

    it("keeps a declared measure that no row has as a column of dashes, never 0, and logs no mismatch", () => {
        render(<AskDevAnswer result={copyOf(projectStatusPartial)} />);

        const flow = tableFor("claim-flow-completed");
        const keys = headerKeys(flow);
        expect(keys.slice(0, 1)).toEqual(["team_id"]);
        expect(keys).toContain("wip_age_p50_hours");
        expect(keys).toContain("bug_completed_ratio_unavailable_reason");
        const column = keys.indexOf("wip_age_p50_hours");
        for (const row of within(flow).getAllByRole("row").slice(1)) {
            const cell = within(row).getAllByRole("cell")[column]!;
            expect(cell).toHaveTextContent("—");
            expect(cell).toHaveAttribute("aria-label", "not in this row");
        }
        expect(warn).not.toHaveBeenCalled();
    });

    it("shows the table's rows for a dual-table fact, not its time-series rows", () => {
        const status = copyOf(projectStatusPartial);
        render(<AskDevAnswer result={status} />);

        const fact = factOf(status, "claim-flow-completed");
        const body = within(tableFor("claim-flow-completed")).getAllByRole("row").slice(1);
        expect(body).toHaveLength(fact.rows?.length ?? -1);
    });

    it("says an absent cell and an explicit null apart, both as a dash, never as 0", () => {
        const status = copyOf(projectStatusPartial);
        const ranking = copyOf(attentionRanking);
        render(
            <>
                <AskDevAnswer result={status} />
                <AskDevAnswer result={ranking} />
            </>,
        );

        const absent = screen.getAllByLabelText("not in this row");
        const nulls = screen.getAllByLabelText("no value");
        expect(absent.length).toBeGreaterThan(0);
        expect(nulls.length).toBeGreaterThan(0);
        for (const cell of [...absent, ...nulls]) {
            expect(cell.textContent).toBe("—");
        }
    });

    it("adds no row: each table has exactly the served rows", () => {
        const status = copyOf(projectStatusPartial);
        render(<AskDevAnswer result={status} />);

        for (const group of groupFactsByTable(factsWithRows(status.claimed_facts ?? []))) {
            const body = within(tableFor(group.primary.claim_id)).getAllByRole("row").slice(1);
            expect(body).toHaveLength(group.primary.rows?.length ?? -1);
        }
    });

    it("gives every table a trend slot that names every claim id of its group", () => {
        const openWork = copyOf(teamOpenWorkDegraded);
        render(<AskDevAnswer result={openWork} />);

        const groups = groupFactsByTable(factsWithRows(openWork.claimed_facts ?? []));
        expect(groups).toHaveLength(1);
        const slots = within(tablesPart()).getAllByTestId("ask-dev-fact-trend-slot");
        expect(slots).toHaveLength(1);
        const ids = [groups[0]!.primary, ...groups[0]!.alsoClaims].map((fact) => fact.claim_id);
        expect(ids.length).toBeGreaterThan(1);
        expect(slots[0]!.getAttribute("data-claim-ids")?.split(" ")).toEqual(ids);
    });

    it("lets a keyboard reach and scroll each wide table: a focusable, named region", () => {
        render(<AskDevAnswer result={copyOf(projectStatusPartial)} />);

        for (const table of tables()) {
            const box = within(table).getByTestId("ask-dev-fact-table-scroll");
            expect(box).toHaveAttribute("tabindex", "0");
            expect(box).toHaveAttribute("role", "group");
            expect(box.getAttribute("aria-label")).toBeTruthy();
            expect(within(box).getByRole("table")).toBeInTheDocument();
        }
    });

    it("shows a served name in place of its raw id, and keeps an id that has no name", () => {
        const merged = copyOf(mergedPrsDegraded);
        render(<AskDevAnswer result={merged} />);

        for (const table of tables()) {
            const keys = headerKeys(table);
            // Declared key `scope_id`; the rows also carry `scope_name`.
            expect(keys[0]).toBe("scope_name");
            expect(keys).not.toContain("scope_id");
            expect(within(table).queryByText(/^project\.v2:/u)).toBeNull();
        }
        cleanup();
        render(<AskDevAnswer result={copyOf(projectStatusPartial)} />);
        // `team_id` has no `team_name` column: the served key stays.
        expect(headerKeys(tableFor("claim-flow-completed"))[0]).toBe("team_id");
    });

    it("renders no table part when no claimed fact has rows", () => {
        render(<AskDevAnswer result={copyOf(ciRateComplete)} />);

        expect(screen.queryByTestId("ask-dev-answer-fact-tables")).toBeNull();
    });

    it("shows a served cell as inert text", () => {
        const status = copyOf(projectStatusPartial);
        // Changed for the test: a hostile string in one served cell.
        factOf(status, "claim-workload-backlog").rows![0]!.fields.day = {
            string: "<img src=x onerror=alert(1)>",
        };
        render(<AskDevAnswer result={status} />);

        expect(
            within(tableFor("claim-workload-backlog")).getByText("<img src=x onerror=alert(1)>"),
        ).toBeInTheDocument();
        expect(document.querySelector("img[src=x]")).toBeNull();
    });
});

describe("the window of the tables (E8 §11.2)", () => {
    const windowLine = () => within(tablesPart()).getByTestId("ask-dev-fact-tables-window");

    it("says the served relative window in words", () => {
        render(<AskDevAnswer result={copyOf(projectStatusPartial)} />);
        expect(windowLine()).toHaveTextContent("Last 30 days");
    });

    it("says 'Window not stated' when the answer has no window", () => {
        render(<AskDevAnswer result={copyOf(mergedPrsDegraded)} />);
        expect(windowLine()).toHaveTextContent(WINDOW_NOT_STATED);
    });

    it("gives the served bounds as UTC dates when there is no relative id", () => {
        const status = copyOf(projectStatusPartial);
        // Changed for the test: the relative id removed, the served bounds kept.
        delete status.effective_evidence_window!.relative_id;
        render(<AskDevAnswer result={status} />);
        expect(windowLine()).toHaveTextContent("2026-09-30 – 2026-10-30");
    });

    it("says the window was inferred when the service chose it", () => {
        const status = copyOf(projectStatusPartial);
        // Changed for the test: the window's provenance.
        status.effective_evidence_window!.provenance = "inferred_default";
        render(<AskDevAnswer result={status} />);
        expect(windowLine()).toHaveTextContent("Last 30 days (window inferred)");
    });
});

describe("a declaration that does not match the rows", () => {
    it("falls back to first-seen column order and logs the claim index, no names", () => {
        const status = copyOf(projectStatusPartial);
        // Changed for the test: the declared key names a column no row has.
        factOf(status, "claim-workload-backlog").table!.key = ["calendar_day"];
        render(<AskDevAnswer result={status} />);

        expect(headerKeys(tableFor("claim-workload-backlog"))).toEqual([
            "backlog_size",
            "day",
            "throughput_mean",
            "throughput_stddev",
        ]);
        expect(warn).toHaveBeenCalledTimes(1);
        const [fields, message] = warn.mock.calls[0]!;
        expect(fields).toEqual({
            claim_index: 0,
            event: "ask_dev_fact_declaration_mismatch",
            reason: "key_column_missing",
        });
        expect(JSON.stringify([fields, message])).not.toMatch(
            /calendar_day|backlog|Synthetic|claim-workload/u,
        );
    });
});

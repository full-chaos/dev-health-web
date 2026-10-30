import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@/test/utils";

import { validateInvestigationResult } from "@/lib/ask-dev/investigation-result";

import { AskDevAnswer } from "../AskDevAnswer";
import {
    ANSWER_COPY,
    ANSWER_STATUS_LABEL,
    DERIVATION_LABEL,
    EPISTEMIC_LABEL,
    FACT_KIND_LABEL,
    STANDING_LABEL,
    type AnswerResult,
} from "../answerModel";
import index from "./captures/index.json";
import projectStatusPartial from "./captures/kiac_project_status_partial.event.json";
import projectReadinessPartial from "./captures/kiac_project_readiness_partial.event.json";
import teamOpenWorkDegraded from "./captures/kiac_team_open_work_degraded.event.json";
import projectStatusClarification from "./captures/kiac_project_status_clarification.event.json";
import unresolvedNoMatch from "./captures/kiac_unresolved_no_match.event.json";

/**
 * CHAOS-11930. Every result here is a real ACR answer captured from the kiac stack (askdev-1,
 * `captures/index.json` names the producer and the questions). None is hand-written; a test that
 * needs hostile or blank text changes one field of a copy of a real answer and says so.
 */
const EVENTS = {
    "kiac_project_status_partial.event.json": projectStatusPartial,
    "kiac_project_readiness_partial.event.json": projectReadinessPartial,
    "kiac_team_open_work_degraded.event.json": teamOpenWorkDegraded,
    "kiac_project_status_clarification.event.json": projectStatusClarification,
    "kiac_unresolved_no_match.event.json": unresolvedNoMatch,
} as const;

const resultOf = (event: { result: unknown }) => event.result as AnswerResult;
const copyOf = (event: { result: unknown }) => structuredClone(resultOf(event));

const statusPartial = resultOf(projectStatusPartial);
const readinessPartial = resultOf(projectReadinessPartial);
const openWorkDegraded = resultOf(teamOpenWorkDegraded);
const clarification = resultOf(projectStatusClarification);
const noMatch = resultOf(unresolvedNoMatch);

function precedes(first: Element, second: Element): boolean {
    return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe("captured fixtures", () => {
    it.each(index.captures)(
        "$file is the unedited producer output and a valid ACR answer",
        (entry) => {
            const event = EVENTS[entry.file as keyof typeof EVENTS];
            expect(event, `${entry.file} is imported here`).toBeDefined();
            const digest = createHash("sha256").update(JSON.stringify(event)).digest("hex");
            expect(digest).toBe(entry.sha256_compact);
            expect(validateInvestigationResult(event.result)).toMatchObject({ valid: true });
            expect(resultOf(event).status).toBe(entry.status);
        },
    );

    it("imports every capture the index names", () => {
        expect(Object.keys(EVENTS).sort()).toEqual(index.captures.map((c) => c.file).sort());
    });
});

describe("AskDevAnswer: quick answer first", () => {
    it("leads with the judgment, the answer's own status and the AI label, before any detail", () => {
        render(<AskDevAnswer result={statusPartial} />);
        const article = screen.getByTestId("ask-dev-answer");
        const quick = screen.getByTestId("ask-dev-answer-quick");
        expect(article.firstElementChild).toBe(quick);

        expect(screen.getByTestId("ask-dev-answer-lead")).toHaveTextContent(
            statusPartial.direct_judgment.trim(),
        );
        expect(screen.getByTestId("ask-dev-answer-status")).toHaveTextContent("Partial answer");
        expect(screen.getByTestId("ask-dev-answer-ai-label")).toHaveTextContent("AI-written");

        for (const later of [
            "ask-dev-answer-drivers",
            "ask-dev-answer-pressures",
            "ask-dev-answer-remaining-work",
            "ask-dev-answer-readiness-gaps",
            "ask-dev-answer-conflicts",
            "ask-dev-answer-more",
        ]) {
            expect(precedes(quick, screen.getByTestId(later)), later).toBe(true);
        }
    });

    it("keeps the current state and a differing service sentence behind More detail", () => {
        render(<AskDevAnswer result={statusPartial} />);
        const more = screen.getByTestId("ask-dev-answer-more");
        expect(more.tagName).toBe("DETAILS");
        expect(more).not.toHaveAttribute("open");
        expect(more).toHaveTextContent(statusPartial.current_state.trim().slice(0, 60));
        expect(more).toHaveTextContent(statusPartial.deterministic_answer.trim().slice(0, 60));
    });

    it("shows the service sentence once when it is the judgment itself", () => {
        expect(readinessPartial.direct_judgment.trim()).toBe(
            readinessPartial.deterministic_answer.trim(),
        );
        render(<AskDevAnswer result={readinessPartial} />);
        expect(screen.getByTestId("ask-dev-answer-more")).not.toHaveTextContent(
            ANSWER_COPY.serviceSummaryTitle,
        );
    });

    it.each([
        ["a clarification", clarification, "Answer needs your confirmation"],
        ["a no-match", noMatch, "No answer: no matching subject"],
    ])(
        "leads with the service sentence on %s, with no AI label and no analysis parts",
        (_l, result, label) => {
            expect(result.direct_judgment.trim()).toBe("");
            expect(result.versions.synthesis_version).toBe("not_synthesized");
            render(<AskDevAnswer result={result} />);
            expect(screen.getByTestId("ask-dev-answer-lead")).toHaveTextContent(
                result.deterministic_answer.trim(),
            );
            expect(screen.getByTestId("ask-dev-answer-status")).toHaveTextContent(label);
            expect(screen.queryByTestId("ask-dev-answer-ai-label")).toBeNull();
            expect(screen.queryByTestId("ask-dev-answer-ai-note")).toBeNull();
            expect(screen.queryByTestId("ask-dev-answer-drivers")).toBeNull();
        },
    );

    it("labels a degraded answer as degraded, with its one driver explained", () => {
        render(<AskDevAnswer result={openWorkDegraded} />);
        expect(screen.getByTestId("ask-dev-answer-status")).toHaveTextContent("Degraded answer");
        expect(screen.getAllByTestId("ask-dev-answer-driver")).toHaveLength(
            openWorkDegraded.drivers.length,
        );
    });
});

describe("AskDevAnswer: drivers are never bare (check 8)", () => {
    it("shows every served driver with its explanation, basis, subjects and evidence", () => {
        expect(statusPartial.drivers.length).toBeGreaterThan(1);
        render(<AskDevAnswer result={statusPartial} />);
        const cards = screen.getAllByTestId("ask-dev-answer-driver");
        expect(cards).toHaveLength(statusPartial.drivers.length);
        statusPartial.drivers.forEach((driver, i) => {
            const card = within(cards[i] as HTMLElement);
            expect(card.getByText(driver.title)).toBeInTheDocument();
            expect(card.getByTestId("ask-dev-answer-driver-summary")).toHaveTextContent(
                driver.summary.trim().slice(0, 40),
            );
            const basis = card.getByTestId("ask-dev-answer-driver-basis");
            expect(basis).toHaveTextContent(FACT_KIND_LABEL[driver.category] as string);
            expect(basis).toHaveTextContent(EPISTEMIC_LABEL[driver.epistemic_status] as string);
            expect(basis).toHaveTextContent(DERIVATION_LABEL[driver.derivation] as string);
            expect(basis).toHaveTextContent(/confidence \d+%/u);
            expect(card.getByText(STANDING_LABEL[driver.standing] as string)).toBeInTheDocument();
            expect(card.getByTestId("ask-dev-answer-subjects")).toHaveTextContent(
                driver.affected_subjects[0].label,
            );
            expect(card.getByText(/evidence reference/u)).toBeInTheDocument();
        });
    });

    it("says a driver came with no explanation instead of showing its title alone", () => {
        const result = copyOf(projectStatusPartial);
        result.drivers[0] = { ...result.drivers[0]!, summary: "  " };
        render(<AskDevAnswer result={result} />);
        const first = screen.getAllByTestId("ask-dev-answer-driver")[0] as HTMLElement;
        expect(within(first).getByTestId("ask-dev-answer-driver-summary")).toHaveTextContent(
            ANSWER_COPY.driverNoExplanation,
        );
        expect(within(first).getByTestId("ask-dev-answer-driver-basis")).toBeInTheDocument();
    });

    it("names a truncated source on the driver it limits", () => {
        const truncated = statusPartial.drivers.find((d) => d.source_state === "truncated");
        expect(truncated).toBeDefined();
        render(<AskDevAnswer result={statusPartial} />);
        const card = screen
            .getAllByTestId("ask-dev-answer-driver")
            .find((el) => el.textContent?.includes(truncated!.title)) as HTMLElement;
        expect(within(card).getByTestId("ask-dev-answer-driver-basis")).toHaveTextContent(
            "the source read was cut short",
        );
    });
});

describe("AskDevAnswer: status, completion and readiness stay apart (check 3)", () => {
    it("puts a readiness gap under Readiness gaps with its own kind, and leaves the others empty", () => {
        expect(readinessPartial.readiness_gaps.length).toBe(1);
        render(<AskDevAnswer result={readinessPartial} />);
        const gaps = screen.getByTestId("ask-dev-answer-readiness-gaps");
        const finding = within(gaps).getByTestId("ask-dev-answer-finding");
        expect(finding).toHaveAttribute("data-kind", readinessPartial.readiness_gaps[0]!.kind);
        expect(finding).toHaveTextContent(
            FACT_KIND_LABEL[readinessPartial.readiness_gaps[0]!.kind] as string,
        );
        expect(screen.getByTestId("ask-dev-answer-remaining-work")).toHaveTextContent(
            ANSWER_COPY.remainingWorkEmpty,
        );
        expect(screen.getByTestId("ask-dev-answer-conflicts")).toHaveTextContent(
            ANSWER_COPY.conflictsEmpty,
        );
    });

    it("never labels the answer's status as a work status, a completion or a readiness", () => {
        const factLabels = new Set(Object.values(FACT_KIND_LABEL));
        for (const label of Object.values(ANSWER_STATUS_LABEL)) {
            expect(label.toLowerCase()).toContain("answer");
            expect(factLabels.has(label)).toBe(false);
        }
        const concepts = ["status", "actual_completion", "readiness", "health"].map(
            (kind) => FACT_KIND_LABEL[kind],
        );
        expect(new Set(concepts).size).toBe(4);
        expect(new Set(Object.values(FACT_KIND_LABEL)).size).toBe(
            Object.keys(FACT_KIND_LABEL).length,
        );
    });

    it("labels every documented value of the open vocabularies (no fallback for them)", () => {
        const documented = {
            kinds: "status, actual_completion, work, blockers, reviews, continuous_integration, deployments, incidents, health, workload, investment, readiness, operational_deficiency, source_health, relationship, narrative",
            standing: "principal, contributing, symptom, context, withheld",
            derivation:
                "canonical_structured, deterministic_projection, graph_associated, model_extracted, rule_inferred",
            epistemic: "observed, source_asserted, inferred, disputed, superseded, unknown",
        };
        const split = (s: string) => s.split(", ");
        expect(Object.keys(FACT_KIND_LABEL).sort()).toEqual(split(documented.kinds).sort());
        expect(Object.keys(STANDING_LABEL).sort()).toEqual(split(documented.standing).sort());
        expect(Object.keys(DERIVATION_LABEL).sort()).toEqual(split(documented.derivation).sort());
        expect(Object.keys(EPISTEMIC_LABEL).sort()).toEqual(split(documented.epistemic).sort());
    });

    it("shows a value the vocabulary does not know yet in plain words", () => {
        const result = copyOf(projectStatusPartial);
        result.drivers[0] = {
            ...result.drivers[0]!,
            category: "flow_pressure",
            standing: "new_standing",
        };
        render(<AskDevAnswer result={result} />);
        const first = screen.getAllByTestId("ask-dev-answer-driver")[0] as HTMLElement;
        expect(within(first).getByTestId("ask-dev-answer-driver-basis")).toHaveTextContent(
            "Flow pressure",
        );
        expect(within(first).getByText("New standing")).toBeInTheDocument();
    });
});

describe("AskDevAnswer: AI output is labelled, in hedged words", () => {
    it("labels a model-written answer and hedges the view's own words about it", () => {
        expect(statusPartial.versions.synthesis_version).not.toBe("not_synthesized");
        render(<AskDevAnswer result={statusPartial} />);
        expect(screen.getByTestId("ask-dev-answer-ai-note")).toHaveTextContent(/suggests/u);
        expect(screen.getByTestId("ask-dev-answer-drivers")).toHaveTextContent(/appears/u);
    });

    it("labels an answer whose synthesis version is missing as AI-written (safe side)", () => {
        const result = copyOf(projectStatusPartial);
        delete (result.versions as { synthesis_version?: string }).synthesis_version;
        render(<AskDevAnswer result={result} />);
        expect(screen.getByTestId("ask-dev-answer-ai-label")).toBeInTheDocument();
    });

    it("keeps assertive verbs out of every string the view writes", () => {
        const assertive = /\b(is|was|detected|determined)\b/iu;
        for (const [key, text] of Object.entries(ANSWER_COPY)) {
            expect(assertive.test(text), `${key}: ${text}`).toBe(false);
        }
        for (const label of Object.values(ANSWER_STATUS_LABEL)) {
            expect(assertive.test(label), label).toBe(false);
        }
    });
});

describe("AskDevAnswer: served prose is inert", () => {
    it("never renders served markup, and links only http(s) with noreferrer noopener", () => {
        // Hostile text placed into one field of a copy of a real answer.
        const result = copyOf(projectStatusPartial);
        result.drivers[0] = {
            ...result.drivers[0]!,
            summary:
                '<img src=x onerror="alert(1)"> javascript:alert(1) see https://example.com/runbook.',
        };
        result.strongest_pressures = ["<script>alert(2)</script> pressure"];
        const { container } = render(<AskDevAnswer result={result} />);
        expect(container.querySelector("img")).toBeNull();
        expect(container.querySelector("script")).toBeNull();
        const links = Array.from(container.querySelectorAll("a"));
        expect(links.map((a) => a.getAttribute("href"))).toEqual(["https://example.com/runbook"]);
        expect(links[0]).toHaveAttribute("rel", "noreferrer noopener");
        expect(links[0]).toHaveAttribute("target", "_blank");
        expect(container).toHaveTextContent('<img src=x onerror="alert(1)">');
    });
});

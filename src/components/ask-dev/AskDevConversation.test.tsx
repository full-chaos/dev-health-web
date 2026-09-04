import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { DevProgressState } from "@/lib/dev/client";

import { AskDevConversation, PROGRESS_LABELS } from "./AskDevConversation";

vi.mock("next/navigation", () => ({
    usePathname: () => "/cockpit",
    useRouter: () => ({ replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

// The error-guidance tests need to drive `stream` per case, so the mock reads
// it from here instead of closing over a literal. Reset in beforeEach.
type MockStream = {
    phase: "idle" | "running" | "completed" | "failed";
    delta: string;
    warnings: string[];
    error: { code: string; safe_message: string; retryable: boolean } | null;
    progress: null;
};
const IDLE_STREAM: Readonly<MockStream> = Object.freeze({
    phase: "idle",
    delta: "",
    warnings: [],
    error: null,
    progress: null,
});
const askDevState = vi.hoisted(() => ({
    stream: {
        phase: "idle",
        delta: "",
        warnings: [],
        error: null,
        progress: null,
    } as {
        phase: "idle" | "running" | "completed" | "failed";
        delta: string;
        warnings: string[];
        error: { code: string; safe_message: string; retryable: boolean } | null;
        progress: null;
    },
}));

vi.mock("./AskDevProvider", () => ({
    useAskDev: () => ({
        availability: { state: "ready" as const },
        committedScopeLabel: null,
        cancelRun: vi.fn(),
        clearProposedContext: vi.fn(),
        conversations: [],
        deleteConversation: vi.fn(),
        historyError: null,
        historyLoading: false,
        loadHistory: vi.fn(),
        openConversation: vi.fn(),
        proposedContext: null,
        proposedQuestions: [],
        proposedScope: {
            schema_version: "dev_scope.v1",
            organization_id: "org-1",
            direct_scope: "organization",
            repositories: [],
            entity_refs: [],
            team_ids: [],
            time_range: {
                start: "2026-06-29T00:00:00Z",
                end: "2026-07-29T00:00:00Z",
                timezone: "UTC",
            },
        },
        proposedScopeLabel: "Organization",
        renameConversation: vi.fn(),
        retryLastQuestion: vi.fn(),
        startNewConversation: vi.fn(),
        stream: askDevState.stream,
        submitQuestion: vi.fn(),
        transcript: [],
    }),
}));

describe("AskDevConversation empty state (CHAOS-3215)", () => {
    beforeAll(() => {
        // jsdom does not implement scrollIntoView; the transcript-follow
        // effect calls it unconditionally on mount (same stub used by
        // AskDevProvider.test.tsx and AskDevTrigger.integration.test.tsx).
        Element.prototype.scrollIntoView = vi.fn();
    });

    it("frames the Ask Dev / Context Fabric relationship and links to the customer doc, opening in a new tab", () => {
        const { container } = render(<AskDevConversation />);

        // The lead-in sentence sits beside the link inside the same <p>, so
        // it is checked against the rendered container text rather than via
        // getByText — an exact/regex element match here would be ambiguous
        // across the paragraph and its ancestors.
        expect(container.textContent).toContain("Powered by Context Fabric.");

        const link = screen.getByRole("link", { name: "Learn more — opens in new tab" });
        expect(link).toHaveAttribute("href", "/docs/use/ai-workflows/");
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
});

describe("Ask Dev progress copy", () => {
    // Mirrors the totality guard in AskDevAnswer.test.tsx. PROGRESS_LABELS is
    // typed TOTAL over DevProgressState, so a re-pin that adds a phase already
    // fails to compile; this reference record makes that pressure visible in
    // the test file too, and the Object.keys comparison catches drift between
    // the two lists even when both happen to compile.
    it("PROGRESS_LABELS has exactly one sanctioned entry per pinned progress phase", () => {
        const knownPhases: Record<DevProgressState, true> = {
            checking_data_freshness: true,
            checking_dependencies: true,
            checking_evidence: true,
            checking_status: true,
            preparing_answer: true,
            querying_metrics: true,
            resolving_scope: true,
        };
        expect(Object.keys(PROGRESS_LABELS).sort()).toEqual(Object.keys(knownPhases).sort());
    });

    it("names every phase without leaking the raw enum value", () => {
        for (const [phase, label] of Object.entries(PROGRESS_LABELS)) {
            expect(label, phase).not.toContain(phase);
            expect(label, phase).not.toContain(phase.replaceAll("_", " "));
        }
    });
});

describe("Ask Dev error guidance", () => {
    beforeAll(() => {
        Element.prototype.scrollIntoView = vi.fn();
    });

    beforeEach(() => {
        askDevState.stream = { ...IDLE_STREAM };
    });

    function renderWithError(code: string, retryable = true) {
        askDevState.stream = {
            ...IDLE_STREAM,
            phase: "failed",
            error: { code, safe_message: "Ask Dev stopped.", retryable },
        };
        return render(<AskDevConversation />);
    }

    // CHAOS-3339. `retryable: false` is what ops emits today: the sole raise
    // site (openai_compatible.py) omits `retryable`, taking
    // AgentProviderError's `retryable=False` default, and the orchestrator
    // passes that straight through. An earlier revision of this copy claimed
    // "retrying may help" regardless; this asserts against that by name.
    it("explains a provider contract violation as a provider-side fault a retry cannot fix", () => {
        renderWithError("provider_contract_violation", false);

        expect(
            screen.getByText(/provider returned a response that violated its contract/iu),
        ).toBeVisible();
        expect(screen.getByText(/provider-side fault/iu)).toBeVisible();
        expect(screen.getByText(/Retrying will not help/iu)).toBeVisible();
        expect(screen.queryByText(/retrying may help/iu)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /retry/iu })).not.toBeInTheDocument();
    });

    // The version-skew case, and the reason the retry sentence is read off
    // `error.retryable` instead of hard-coded: web pins ops' contracts and
    // re-pins later, so an ops that decides this fault is recoverable must not
    // meet a web build that insists otherwise and hides the only retry button.
    // The fault attribution still holds — only the retry advice moves.
    it("drops the retry advice, not the fault attribution, when ops calls the violation retryable", () => {
        renderWithError("provider_contract_violation", true);

        expect(screen.getByText(/provider-side fault/iu)).toBeVisible();
        expect(screen.queryByText(/Retrying will not help/iu)).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /retry/iu })).toBeVisible();
    });

    // The pre-existing behaviour this must not disturb: an exhausted
    // allowance replaces the retry button rather than sitting beside it.
    it("replaces the retry affordance for an exhausted allowance", () => {
        renderWithError("cost_limit_reached");

        expect(screen.getByText(/Retrying immediately will not help/iu)).toBeVisible();
        expect(screen.queryByRole("button", { name: /retry/iu })).not.toBeInTheDocument();
    });

    // Also the guard on the allowance override: it is the one arm allowed to
    // suppress the retry button against a retryable error, so an override
    // predicate that widened past the allowance codes would silently strip the
    // affordance from every failure. This is the case that fails if it does.
    it("shows no tailored guidance for an unrelated error code, and keeps its retry button", () => {
        renderWithError("internal_error");

        expect(screen.queryByText(/violated its contract/iu)).not.toBeInTheDocument();
        expect(screen.queryByText(/Retrying immediately will not help/iu)).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /retry/iu })).toBeVisible();
    });

    it("never renders the raw error code", () => {
        renderWithError("provider_contract_violation");

        expect(screen.queryByText(/provider_contract_violation/u)).not.toBeInTheDocument();
        expect(screen.queryByText(/provider contract violation/iu)).not.toBeInTheDocument();
    });
});

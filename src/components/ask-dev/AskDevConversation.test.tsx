import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { AskDevConversation } from "./AskDevConversation";

vi.mock("next/navigation", () => ({
    usePathname: () => "/cockpit",
    useRouter: () => ({ replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
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
        stream: { phase: "idle" as const, delta: "", warnings: [], error: null, progress: null },
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

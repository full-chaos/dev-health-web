import { render, screen, userEvent, waitFor, within } from "@/test/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";

import { EvidenceDrawerProvider, useEvidenceDrawer } from "./EvidenceDrawerProvider";
import { EvidencePanel } from "./EvidencePanel";

// The `intro` of a request subject (CHAOS-8063): content the opener already has, shown first in
// the shared drawer in every state of the request.

const { mockGetExplainData } = vi.hoisted(() => ({ mockGetExplainData: vi.fn() }));

vi.mock("@/lib/api/home", () => ({ getExplainData: mockGetExplainData }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/dashboard",
    useSearchParams: () => new URLSearchParams(),
}));

const filters = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 90 },
    who: {},
    what: {},
    why: {},
    how: {},
} as MetricFilter;

const explain = {
    metric: "cycle_time",
    label: "Cycle Time",
    summary: "Cycle time appears lower in this window.",
    evidence: [],
    actions: [],
};

const intro = <p>Served recommended action.</p>;

const panel = (withIntro: boolean) => (
    <EvidencePanel
        isOpen
        onCloseAction={() => undefined}
        title="Cycle Time"
        metric="cycle_time"
        filters={filters}
        intro={withIntro ? intro : undefined}
    />
);

beforeEach(() => {
    mockGetExplainData.mockReset();
});

describe("EvidencePanel intro", () => {
    it("shows the opener's content first, above the loaded evidence", async () => {
        mockGetExplainData.mockResolvedValue(explain);
        render(panel(true));

        await waitFor(() => expect(screen.getByTestId("evidence-facts")).toBeInTheDocument());
        const introNode = screen.getByTestId("evidence-intro");
        expect(introNode).toHaveTextContent("Served recommended action.");
        // Document order: subject, intro, then the loaded facts.
        const subject = screen.getByTestId("evidence-subject");
        const facts = screen.getByTestId("evidence-facts");
        expect(subject.compareDocumentPosition(introNode)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
        expect(introNode.compareDocumentPosition(facts)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it("keeps the opener's content while the request loads", () => {
        mockGetExplainData.mockReturnValue(new Promise(() => undefined));
        render(panel(true));
        expect(screen.getByTestId("evidence-intro")).toHaveTextContent(
            "Served recommended action.",
        );
        expect(screen.queryByTestId("evidence-facts")).toBeNull();
    });

    it("keeps the opener's content when the request fails", async () => {
        mockGetExplainData.mockRejectedValue(new Error("API error: 500"));
        render(panel(true));
        await waitFor(() => expect(screen.getByTestId("evidence-error-state")).toBeInTheDocument());
        expect(screen.getByTestId("evidence-intro")).toHaveTextContent(
            "Served recommended action.",
        );
    });

    it("renders no intro node when the opener passes none", async () => {
        mockGetExplainData.mockResolvedValue(explain);
        render(panel(false));
        await waitFor(() => expect(screen.getByTestId("evidence-facts")).toBeInTheDocument());
        expect(screen.queryByTestId("evidence-intro")).toBeNull();
    });
});

function Opener() {
    const evidence = useEvidenceDrawer();
    return (
        <button
            type="button"
            onClick={() =>
                evidence.open({ title: "Cycle Time", metric: "cycle_time", filters, intro })
            }
        >
            Open
        </button>
    );
}

describe("EvidenceDrawerProvider intro", () => {
    it("passes the subject's intro to the one shared drawer", async () => {
        mockGetExplainData.mockResolvedValue(explain);
        render(
            <EvidenceDrawerProvider>
                <Opener />
            </EvidenceDrawerProvider>,
        );
        await userEvent.click(screen.getByRole("button", { name: "Open" }));
        const drawer = screen.getByRole("dialog", { name: "Evidence & Context" });
        expect(within(drawer).getByTestId("evidence-intro")).toHaveTextContent(
            "Served recommended action.",
        );
    });
});

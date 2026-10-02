import { render, screen, userEvent, waitFor, within } from "@/test/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";

import type { MetricFilter } from "@/lib/filters/types";

import { EvidenceDrawerProvider, useEvidenceDrawer } from "./EvidenceDrawerProvider";

const { mockGetExplainData, nav } = vi.hoisted(() => ({
    mockGetExplainData: vi.fn(),
    nav: { pathname: "/dashboard" },
}));

vi.mock("@/lib/api/home", () => ({ getExplainData: mockGetExplainData }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("next/navigation", () => ({
    usePathname: () => nav.pathname,
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

const explain = (label: string) => ({
    metric: "cycle_time",
    label,
    summary: `${label} appears lower in this window.`,
    evidence: [],
    actions: [],
});

/** Two openers in different places of the page: a header action and a table row. */
function Page() {
    const evidence = useEvidenceDrawer();
    return (
        <div>
            <button
                type="button"
                onClick={() =>
                    evidence.open({ title: "Cycle Time", metric: "cycle_time", filters })
                }
            >
                Header action
            </button>
            <button
                type="button"
                onClick={() =>
                    evidence.open({
                        title: "Review Latency",
                        apiUrl: "/api/v1/explain?metric=review_latency",
                        filters,
                    })
                }
            >
                Row action
            </button>
            {/* A subject with no evidence reference: the panel sends no request for it. */}
            <button type="button" onClick={() => evidence.open({ title: "Whole page", filters })}>
                Bare action
            </button>
        </div>
    );
}

const app = () => (
    <EvidenceDrawerProvider>
        <Page />
    </EvidenceDrawerProvider>
);

const subject = () => within(screen.getByRole("dialog")).getByTestId("evidence-subject");

beforeEach(() => {
    nav.pathname = "/dashboard";
    mockGetExplainData.mockReset();
    mockGetExplainData.mockImplementation(async ({ metric }: { metric: string }) =>
        explain(metric === "cycle_time" ? "Cycle Time" : "Review Latency"),
    );
});

describe("EvidenceDrawerProvider", () => {
    it("renders no drawer until a caller opens it", () => {
        render(app());
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(mockGetExplainData).not.toHaveBeenCalled();
    });

    it("opens ONE drawer named 'Evidence & Context' with the subject in the body", async () => {
        render(app());
        await userEvent.click(screen.getByRole("button", { name: "Header action" }));

        const dialog = screen.getByRole("dialog", { name: "Evidence & Context" });
        expect(within(dialog).getByText("Contextual investigation")).toBeInTheDocument();
        expect(subject()).toHaveTextContent("Cycle Time");
        // The drawer title is not the subject.
        expect(within(dialog).getByRole("heading", { level: 2 })).toHaveTextContent(
            "Evidence & Context",
        );
        await waitFor(() =>
            expect(mockGetExplainData).toHaveBeenCalledWith({ metric: "cycle_time", filters }),
        );
    });

    it("sends the subject's evidence_ref and filters to the panel (a row opens the same drawer)", async () => {
        render(app());
        await userEvent.click(screen.getByRole("button", { name: "Row action" }));

        expect(screen.getAllByRole("dialog")).toHaveLength(1);
        expect(subject()).toHaveTextContent("Review Latency");
        await waitFor(() =>
            expect(mockGetExplainData).toHaveBeenCalledWith({ metric: "review_latency", filters }),
        );
    });

    it("closes from the drawer and gives focus back to the opener", async () => {
        render(app());
        const opener = screen.getByRole("button", { name: "Header action" });
        await userEvent.click(opener);
        await userEvent.click(screen.getByRole("button", { name: "Close" }));

        expect(screen.queryByRole("dialog")).toBeNull();
        expect(opener).toHaveFocus();
    });

    it("replaces the subject while open: still one drawer, no data of the subject before it", async () => {
        render(app());
        await userEvent.click(screen.getByRole("button", { name: "Header action" }));
        expect(await screen.findByText(/Cycle Time appears lower/)).toBeInTheDocument();

        // A second caller opens the drawer while it is open (jsdom lets the click through).
        await userEvent.click(screen.getByRole("button", { name: "Bare action" }));

        expect(screen.getAllByRole("dialog")).toHaveLength(1);
        expect(subject()).toHaveTextContent("Whole page");
        expect(screen.queryByText(/Cycle Time appears lower/)).toBeNull();
        expect(mockGetExplainData).toHaveBeenCalledTimes(1);
    });

    it("closes on a navigation and stays closed when the user comes back", async () => {
        const view = render(app());
        await userEvent.click(screen.getByRole("button", { name: "Header action" }));
        expect(screen.getByRole("dialog")).toBeInTheDocument();

        nav.pathname = "/explore";
        view.rerender(app());
        expect(screen.queryByRole("dialog")).toBeNull();

        nav.pathname = "/dashboard";
        view.rerender(app());
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("closes when the user follows the footer link (the path can stay the same)", async () => {
        render(app());
        await userEvent.click(screen.getByRole("button", { name: "Header action" }));
        const link = await screen.findByRole("link", { name: /Open evidence/ });
        // jsdom does not navigate; stop the default so the click only runs the handlers.
        link.addEventListener("click", (event) => event.preventDefault());
        await userEvent.click(link);

        expect(screen.queryByRole("dialog")).toBeNull();
    });
});

/** A caller with a body of its own (as a chart dot, a heatmap cell or a table row has). */
function ContentPage({ onClose }: { onClose?: () => void }) {
    const evidence = useEvidenceDrawer();
    const region = useRef<HTMLDivElement>(null);
    return (
        <div>
            <button
                type="button"
                onClick={() =>
                    evidence.open({
                        title: "Team Alpha",
                        content: <p>body of the point</p>,
                        footer: <a href="/code">Footer link</a>,
                        onClose,
                    })
                }
            >
                Row button
            </button>
            {/* Not focusable by Tab; stands for a chart region whose marks are drawn on a canvas. */}
            <div ref={region} tabIndex={-1} data-testid="chart-region">
                <span
                    data-testid="canvas-mark"
                    onClick={() =>
                        evidence.open({
                            title: "Team Beta",
                            content: <p>body of the mark</p>,
                            returnFocusRef: region,
                        })
                    }
                >
                    mark
                </span>
            </div>
        </div>
    );
}

describe("EvidenceDrawerProvider with a body of the caller", () => {
    const content = (onClose?: () => void) => (
        <EvidenceDrawerProvider>
            <ContentPage onClose={onClose} />
        </EvidenceDrawerProvider>
    );

    it("renders the caller's body and footer in the same drawer frame, with no evidence request", async () => {
        render(content());
        await userEvent.click(screen.getByRole("button", { name: "Row button" }));

        const dialog = screen.getByRole("dialog", { name: "Evidence & Context" });
        expect(within(dialog).getByText("Contextual investigation")).toBeInTheDocument();
        expect(subject()).toHaveTextContent("Team Alpha");
        expect(within(dialog).getByText("body of the point")).toBeInTheDocument();
        expect(within(dialog).getByRole("link", { name: "Footer link" })).toBeInTheDocument();
        expect(mockGetExplainData).not.toHaveBeenCalled();
    });

    it("closes on Escape and gives focus back to the button that opened it", async () => {
        render(content());
        const opener = screen.getByRole("button", { name: "Row button" });
        await userEvent.click(opener);
        expect(screen.getByRole("dialog")).toBeInTheDocument();

        await userEvent.keyboard("{Escape}");

        expect(screen.queryByRole("dialog")).toBeNull();
        expect(opener).toHaveFocus();
    });

    it("gives focus to the caller's region when the opener is not focusable (a mark on a canvas)", async () => {
        render(content());
        await userEvent.click(screen.getByTestId("canvas-mark"));
        expect(subject()).toHaveTextContent("Team Beta");

        await userEvent.keyboard("{Escape}");

        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.getByTestId("chart-region")).toHaveFocus();
    });

    it("tells the caller when the drawer closes, and when another subject replaces it", async () => {
        const onClose = vi.fn();
        render(content(onClose));
        await userEvent.click(screen.getByRole("button", { name: "Row button" }));
        expect(onClose).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole("button", { name: "Close" }));
        expect(onClose).toHaveBeenCalledTimes(1);

        await userEvent.click(screen.getByRole("button", { name: "Row button" }));
        await userEvent.click(screen.getByTestId("canvas-mark"));
        expect(screen.getAllByRole("dialog")).toHaveLength(1);
        expect(subject()).toHaveTextContent("Team Beta");
        expect(onClose).toHaveBeenCalledTimes(2);
    });
});

describe("useEvidenceDrawer", () => {
    it("throws outside the provider (no silent dead button)", () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        expect(() => render(<Page />)).toThrow(
            "useEvidenceDrawer must be used inside EvidenceDrawerProvider",
        );
        consoleError.mockRestore();
    });
});

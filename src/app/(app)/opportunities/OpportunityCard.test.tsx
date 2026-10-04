import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, within } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OpportunityCard } from "./OpportunityCard";
import type { MetricFilter } from "@/lib/filters/types";
import type { OpportunityCard as OpportunityCardData } from "@/lib/types";

const panel = vi.hoisted(() => vi.fn());
vi.mock("@/components/evidence/EvidencePanel", () => ({
    EvidencePanel: (props: { isOpen: boolean; apiUrl?: string; title: string }) => {
        panel(props);
        return props.isOpen ? <div data-testid="evidence-drawer">{props.apiUrl}</div> : null;
    },
}));

const filters = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 30 },
    who: {},
    what: {},
    why: {},
    how: {},
} as MetricFilter;

const reduceReviewLatency: OpportunityCardData = {
    id: "reduce-review-latency",
    title: "Reduce Review Latency",
    rationale: "Review wait time appears to lengthen cycle time in this window.",
    evidence_links: ["/api/v1/explain?metric=review_latency", "/api/v1/explain?metric=cycle_time"],
    suggested_experiments: [
        "Trial a 24h review SLA for the auth squad",
        "Add a second reviewer to the on-call rota",
    ],
};

describe("OpportunityCard (the selected opportunity)", () => {
    it("shows the rationale sentence as it comes and numbered next steps, never as evidence", () => {
        render(<OpportunityCard card={reduceReviewLatency} filters={filters} activeRole="eng" />);

        expect(
            within(screen.getByTestId("opportunity-captured-change")).getByText(
                "Review wait time appears to lengthen cycle time in this window.",
            ),
        ).toBeInTheDocument();
        const steps = within(screen.getByTestId("opportunity-card-next-step"));
        expect(steps.getByText("Suggested next steps")).toBeInTheDocument();
        expect(steps.getAllByRole("listitem")).toHaveLength(2);
        const evidence = screen.getByTestId("opportunity-card-evidence");
        expect(within(evidence).queryByText(/24h review SLA/)).not.toBeInTheDocument();
    });

    it("draws the next steps in an inset with a numbered badge per step, and a primary evidence button", () => {
        render(<OpportunityCard card={reduceReviewLatency} filters={filters} activeRole="eng" />);

        const inset = screen.getByTestId("opportunity-card-next-step");
        expect(
            within(inset).getByRole("heading", { level: 4, name: "Suggested next steps" }),
        ).toBeInTheDocument();
        const badges = within(inset)
            .getAllByRole("listitem")
            .map((li) => li.querySelector("span[aria-hidden]")?.textContent);
        expect(badges).toEqual(["1", "2"]);
        const button = screen.getByRole("button", { name: "View metric evidence" });
        expect(button.querySelector("svg")).not.toBeNull();
        expect(button.className).toContain("bg-(--action)");
    });

    it("opens the shared evidence drawer on the first evidence link", async () => {
        render(<OpportunityCard card={reduceReviewLatency} filters={filters} activeRole="eng" />);

        expect(screen.queryByTestId("evidence-drawer")).toBeNull();
        await userEvent.click(screen.getByRole("button", { name: "View metric evidence" }));
        expect(screen.getByTestId("evidence-drawer")).toHaveTextContent(
            "/api/v1/explain?metric=review_latency",
        );
    });

    it("lists the further evidence links with the Explore URL production builds", () => {
        render(<OpportunityCard card={reduceReviewLatency} filters={filters} activeRole="eng" />);

        const more = within(screen.getByTestId("opportunity-card-evidence")).getByRole("link", {
            name: /Open artifact/i,
        });
        expect(more).toHaveAttribute("href", expect.stringContaining("api=%2Fapi%2Fv1%2Fexplain"));
    });

    it("draws the arrow before 'Explore experiments' (prototype btn())", () => {
        render(<OpportunityCard card={reduceReviewLatency} filters={filters} activeRole="eng" />);

        const link = screen.getByRole("link", { name: "Explore experiments" });
        expect(link.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    });

    it("links to the experiments with the filter and the role", () => {
        render(<OpportunityCard card={reduceReviewLatency} filters={filters} activeRole="eng" />);

        const link = screen.getByRole("link", { name: "Explore experiments" });
        const url = new URL(link.getAttribute("href") ?? "", "https://app.example");
        expect(url.pathname).toBe("/improve/experiments");
        expect(url.searchParams.get("f")).toBeTruthy();
        expect(url.searchParams.get("role")).toBe("eng");
    });

    it("disables the Evidence affordance when a card has no real artifacts", () => {
        const noArtifacts: OpportunityCardData = { ...reduceReviewLatency, evidence_links: [] };
        render(<OpportunityCard card={noArtifacts} filters={filters} activeRole="eng" />);

        const evidence = screen.getByTestId("opportunity-card-evidence");
        expect(within(evidence).queryByRole("button")).not.toBeInTheDocument();
        expect(within(evidence).getByText(/No linked artifacts in this window/i)).toHaveAttribute(
            "aria-disabled",
            "true",
        );
        expect(screen.getByTestId("opportunity-card-next-step")).toBeInTheDocument();
    });

    // CHAOS-8486: the API names an opportunity by the metric's polarity (CHAOS-7776): "Recover" for a
    // metric where higher is better, "Reduce" where lower is better. The web adds no direction warning.
    it.each([
        ["Recover Throughput", "/api/v1/explain?metric=throughput"],
        ["Reduce Review Latency", "/api/v1/explain?metric=review_latency"],
    ])("draws the served title %j as it comes, with no direction warning", (title, link) => {
        const card: OpportunityCardData = { ...reduceReviewLatency, title, evidence_links: [link] };
        render(<OpportunityCard card={card} filters={filters} activeRole="eng" />);

        const detail = screen.getByTestId("opportunity-detail");
        expect(within(detail).getByRole("heading", { name: title })).toBeInTheDocument();
        expect(screen.queryByTestId("opportunity-direction-note")).toBeNull();
        expect(detail).not.toHaveTextContent(/suggests reducing/i);
        expect(detail).not.toHaveTextContent(/a rise is usually good/i);
    });
});

// CHAOS-8109: the API serves the move a card is about as values: `change_percent` (signed,
// unrounded), `direction` ("up" | "down": the sign as a word, not good or bad), and the compared
// windows `range_days` / `compare_days`. The card shows them as served; before, the number was
// only inside the rationale sentence.
describe("OpportunityCard — the served change", () => {
    const withChange = (over: Partial<OpportunityCardData>): OpportunityCardData => ({
        ...reduceReviewLatency,
        rationale: "Review Latency climbed 1041% in the last 14 days.",
        change_percent: 1041.4,
        direction: "up",
        range_days: 14,
        compare_days: 14,
        ...over,
    });
    const block = () => within(screen.getByTestId("opportunity-captured-change"));
    const value = () => screen.getByTestId("opportunity-change-value");
    const windowLine = () => screen.queryByTestId("opportunity-change-window");
    const show = (over: Partial<OpportunityCardData> = {}) =>
        render(<OpportunityCard card={withChange(over)} filters={filters} activeRole="eng" />);

    it("shows the served change big, under the label 'Captured change' (caps by CSS)", () => {
        show();
        const label = block().getByText("Captured change");
        expect(label.className).toContain("uppercase");
        expect(value()).toHaveTextContent(/^\+1,041%$/u);
        expect(value().className).toContain("text-[1.75rem]");
    });

    it("says the direction as the served word and the window with the served days", () => {
        show();
        expect(windowLine()).toHaveTextContent(/^Up, last 14 days against the 14 days before\.$/u);
    });

    it("prints a fall with its served sign and the served word", () => {
        show({ change_percent: -33.26, direction: "down", range_days: 7, compare_days: 30 });
        expect(value()).toHaveTextContent(/^-33%$/u);
        expect(windowLine()).toHaveTextContent(/^Down, last 7 days against the 30 days before\.$/u);
    });

    it("says day, not days, for a window of one day", () => {
        show({ range_days: 1, compare_days: 1 });
        expect(windowLine()).toHaveTextContent(/^Up, last 1 day against the 1 day before\.$/u);
    });

    it("keeps the served rationale sentence under the value", () => {
        show();
        expect(
            block().getByText("Review Latency climbed 1041% in the last 14 days."),
        ).toBeInTheDocument();
    });

    it("prints the unrounded served number by the one change formatter: a small change is not 0%", () => {
        show({ change_percent: 0.3 });
        expect(value()).toHaveTextContent(/^\+0\.3%$/u);
    });

    it("prints a served 0 as 0%", () => {
        show({ change_percent: 0 });
        expect(value()).toHaveTextContent(/^0%$/u);
    });

    // The card has no served no-data flag. The web adds no rule of its own (a guess would be a
    // web-made value): a served -100 is printed as it is served.
    it("prints a served -100 as -100%: the web has no rule of its own for it", () => {
        show({ change_percent: -100, direction: "down" });
        expect(value()).toHaveTextContent(/^-100%$/u);
        expect(screen.getByTestId("opportunity-captured-change")).not.toHaveTextContent(
            /no data/iu,
        );
    });

    it.each([
        ["null", null],
        ["absent", undefined],
    ])("reads Not reported when the change is not served (%s), never 0%", (_name, change) => {
        show({ change_percent: change, direction: null });
        expect(value()).toHaveTextContent(/^Not reported$/u);
        expect(screen.getByTestId("opportunity-captured-change")).not.toHaveTextContent("0%");
        // the fallback card still says its served window, with no direction word
        expect(windowLine()).toHaveTextContent(/^Last 14 days against the 14 days before\.$/u);
    });

    it("draws no window line when a window number is not served, and puts no number in its place", () => {
        show({ range_days: undefined, compare_days: null, direction: null, change_percent: null });
        expect(windowLine()).toBeNull();
        // the block holds the label, the value and the served sentence, and nothing more
        expect(screen.getByTestId("opportunity-captured-change").childElementCount).toBe(2);
        expect(value()).toHaveTextContent(/^Not reported$/u);
    });

    it("reads Not reported for a change that is not a finite number, in muted ink", () => {
        show({ change_percent: Number.NaN });
        expect(value()).toHaveTextContent(/^Not reported$/u);
        expect(value().className).toContain("text-(--ink-muted)");
        expect(value().className).not.toContain("text-foreground");
    });

    it.each([
        ["only the current window", { range_days: 14, compare_days: null }],
        ["only the window before", { range_days: null, compare_days: 14 }],
    ])("draws no window phrase when %s is served: the other one is not made", (_name, days) => {
        show({ ...days, direction: null });
        expect(windowLine()).toBeNull();
    });

    it("says only the direction word when no window is served", () => {
        show({ range_days: undefined, compare_days: undefined });
        expect(windowLine()).toHaveTextContent(/^Up\.$/u);
    });

    it("says no direction word for a direction that is not 'up' or 'down'", () => {
        show({ direction: "sideways" as unknown as "up" });
        expect(windowLine()).toHaveTextContent(/^Last 14 days against the 14 days before\.$/u);
    });

    // "up" and "down" are the sign as a word, not good or bad: a rise of a metric where a rise is
    // bad and a fall of a metric where a fall is bad look the same.
    it("gives the value no good or bad colour from the direction or the sign", () => {
        const { unmount } = show({ change_percent: 50, direction: "up" });
        const up = value().className;
        unmount();
        show({ change_percent: -50, direction: "down" });
        const down = value().className;
        expect(down).toBe(up);
        for (const token of ["positive", "negative", "caution", "danger", "success", "warn"]) {
            expect(up, token).not.toContain(token);
        }
        expect(up).toContain("text-foreground");
    });
});

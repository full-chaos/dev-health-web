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

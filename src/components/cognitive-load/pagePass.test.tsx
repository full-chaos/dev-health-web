import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// The chart itself is not under test (it needs matchMedia); the frame around it is.
vi.mock("@/components/charts/TimeseriesChart", () => ({
    TimeseriesChart: () => <div data-testid="timeseries-stub" />,
}));

import { render, screen } from "@/test/utils";
import type { MetricFilter } from "@/lib/filters/types";

import {
    IndividualGuardrailNotice,
    LoadDataUnavailable,
    OverviewView,
    PrivacyHeader,
    SelfReflectionNotice,
    type LoadKpi,
} from "./CognitiveLoadViews";

const filters = {
    scope: { level: "team" as const, ids: ["team-1"] },
    time: { range_days: 30 },
    what: { repos: [] },
} as unknown as MetricFilter;
const window = { sinceDate: "2026-05-01", untilDate: "2026-05-31" };
const signals: LoadKpi[] = [
    {
        label: "Context spread",
        value: "7",
        delta: "avg over 31 days",
        deltaTone: "text-(--caution)",
        interpretation: "Watch",
        description:
            "Distinct repos, PRs, reviews, and touched file areas in the selected team scope.",
    },
];

describe("Cognitive Load page pass (CHAOS-7618)", () => {
    it("the guardrail is a page-load Notice warn with the production heading, copy and link", () => {
        const { container } = render(<IndividualGuardrailNotice />);
        const notice = container.querySelector('[data-notice-variant="warn"]');
        expect(notice).not.toBeNull();
        expect(notice).not.toHaveAttribute("role");
        expect(
            screen.getByRole("heading", { name: "Individual cognitive load is self-only." }),
        ).toBeInTheDocument();
        expect(screen.getByText("Individual guardrail")).toBeInTheDocument();
        expect(
            screen.getByText(
                /Person-scoped cognitive-load signals are available only when the selected identity matches the current session\./u,
            ),
        ).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Return to team/repo view" })).toHaveAttribute(
            "href",
            "/cognitive-load",
        );
    });

    it("self-reflection is a page-load Notice info with the production copy", () => {
        const { container } = render(<SelfReflectionNotice />);
        expect(container.querySelector('[data-notice-variant="info"]')).not.toBeNull();
        expect(screen.getByText("Self-reflection mode")).toBeInTheDocument();
        expect(
            screen.getByText(
                /Only you can open this individual cognitive-load view\. These signals are for reflection on focus pressure, not manager review or peer comparison\./u,
            ),
        ).toBeInTheDocument();
    });

    it("a failed request is the DataState error with the message", () => {
        const { container } = render(<LoadDataUnavailable message="GraphQL request failed" />);
        expect(container.querySelector('[data-variant="error"]')).not.toBeNull();
        expect(screen.getByText("Data unavailable")).toBeInTheDocument();
        expect(screen.getByText("GraphQL request failed")).toBeInTheDocument();
    });

    it("the privacy header keeps its words on every tab", () => {
        render(<PrivacyHeader />);
        expect(screen.getByText("Privacy-first cognitive load")).toBeInTheDocument();
        expect(
            screen.getByRole("heading", { name: "Focus fragmentation, not surveillance." }),
        ).toBeInTheDocument();
        expect(screen.getByText("Guardrail")).toBeInTheDocument();
        expect(screen.getByText(/No leaderboards\. No peer rankings\./u)).toBeInTheDocument();
    });

    it("the Overview adds the context-spread line and an Explore load drivers link that keeps f and role", () => {
        render(
            <OverviewView
                signals={signals}
                window={window}
                filters={filters}
                activeRole="engineer"
                trend={[
                    { day: "2026-05-01", value: 3, label: "05-01" },
                    { day: "2026-05-02", value: 9, label: "05-02" },
                ]}
            />,
        );
        expect(screen.getByTestId("cognitive-load-context-switching")).toBeInTheDocument();
        const link = screen.getByRole("link", { name: "Explore load drivers" });
        const href = link.getAttribute("href") ?? "";
        expect(href).toContain("/cognitive-load?tab=load-drivers");
        expect(href).toContain("f=");
        expect(href).toContain("role=engineer");
        expect(screen.getByRole("heading", { name: "How to read this" })).toBeInTheDocument();
    });

    it("draws the tiles as one strip, the main-aside grid, an inset and the primary button with the arrow first", () => {
        render(
            <OverviewView
                signals={signals}
                window={window}
                filters={filters}
                trend={[{ day: "2026-05-01", value: 3, label: "05-01" }]}
            />,
        );
        expect(screen.getByTestId("cognitive-load-tiles")).toHaveAttribute("data-columns", "1");
        const lower = screen.getByTestId("cognitive-load-overview-lower");
        expect(lower.className).toContain("lg:grid-cols-[minmax(0,1fr)_320px]");
        expect(
            screen.getByRole("heading", { level: 4, name: "Team/repo-first by default" }),
        ).toBeInTheDocument();
        const button = screen.getByRole("link", { name: "Explore load drivers" });
        expect(button.firstElementChild?.tagName.toLowerCase()).toBe("svg");
        expect(button.className).toContain("bg-(--action)");
    });

    it("with no per-day value the line says it is unavailable (no value is never 0)", () => {
        render(<OverviewView signals={signals} window={window} filters={filters} trend={[]} />);
        expect(screen.getByText("No context-spread data")).toBeInTheDocument();
    });

    it("a tile shows the chip word before the period text and keeps the delta tone", () => {
        render(<OverviewView signals={signals} window={window} filters={filters} trend={[]} />);
        const chip = screen.getByText("Watch");
        const delta = screen.getByText("avg over 31 days");
        expect(chip.compareDocumentPosition(delta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(delta.className).toContain("text-(--caution)");
    });

    it("the page uses the components and has no raw palette class", () => {
        const page = readFileSync(
            join(process.cwd(), "src/app/(app)/cognitive-load/page.tsx"),
            "utf8",
        );
        for (const name of [
            "PrivacyHeader",
            "IndividualGuardrailNotice",
            "SelfReflectionNotice",
            "LoadDataUnavailable",
        ]) {
            expect(page, name).toContain(`<${name}`);
        }
        expect(page).not.toMatch(/\b(?:text|bg|border)-(?:amber|emerald|rose|red|green)-\d{2,3}/u);
    });
});

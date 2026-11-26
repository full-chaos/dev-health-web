import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { getPersonSummary } from "@/lib/api/people";

import PersonPage from "./page";

// The person page reads GET /api/v1/people/{id}/summary. The API serves
// sections.work_mix and sections.flow_breakdown as ARRAYS (work_mix: [{key,
// name, value}], flow_breakdown: [{stage, value, unit}]). These cells render
// the page from that served shape, with synthetic values.

vi.mock("next/navigation", () => ({
    usePathname: () => "/people/person-1",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/api/people", () => ({ getPersonSummary: vi.fn() }));
vi.mock("@/lib/api/visuals", () => ({ getQuadrant: vi.fn().mockResolvedValue(null) }));
vi.mock("@/components/people/PersonRangeBar", () => ({
    PersonRangeBar: () => <div data-testid="person-range-bar" />,
}));
vi.mock("@/components/charts/DonutChart", () => ({ DonutChart: () => null }));
vi.mock("@/components/charts/HorizontalBarChart", () => ({ HorizontalBarChart: () => null }));
vi.mock("@/components/charts/QuadrantPanel", () => ({ QuadrantPanel: () => null }));
vi.mock("@/components/metrics/MetricCard", () => ({ MetricCard: () => null }));

function summary(sections: Record<string, unknown>) {
    return {
        person: { display_name: "Synthetic Person", identities: [], active: true },
        deltas: [],
        narrative: [],
        sections,
        freshness: { last_ingested_at: null, sources: {} },
    };
}

async function renderPage() {
    return render(
        await PersonPage({
            params: Promise.resolve({ person_id: "person-1" }),
            searchParams: Promise.resolve({}),
        }),
    );
}

function card(title: string) {
    const heading = screen.getByRole("heading", { name: title });
    return within(heading.parentElement!.parentElement!);
}

beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("Person page reads the served summary shape", () => {
    it("renders the flow stages and the work-mix entries the API serves", async () => {
        vi.mocked(getPersonSummary).mockResolvedValue(
            summary({
                work_mix: [
                    { key: "feature", name: "Feature", value: 7 },
                    { key: "chore", name: "Chore", value: 2 },
                ],
                flow_breakdown: [
                    { stage: "Active", value: 11, unit: "hours" },
                    { stage: "Waiting", value: 4, unit: "hours" },
                ],
            }) as never,
        );
        await renderPage();

        const flow = card("Flow breakdown");
        expect.soft(flow.queryByText("Flow stage detail unavailable.")).toBeNull();
        expect.soft(flow.queryByText("Active")).not.toBeNull();
        expect.soft(flow.queryByText("Waiting")).not.toBeNull();

        const workMix = card("Work mix");
        expect.soft(workMix.queryByText("Work mix data unavailable.")).toBeNull();
        expect.soft(workMix.queryByText("Feature")).not.toBeNull();
        expect.soft(workMix.queryByText("Chore")).not.toBeNull();
    });

    it("control: empty served lists keep the existing empty states", async () => {
        vi.mocked(getPersonSummary).mockResolvedValue(
            summary({ work_mix: [], flow_breakdown: [] }) as never,
        );
        await renderPage();

        expect(
            card("Flow breakdown").getByText("Flow stage detail unavailable."),
        ).toBeInTheDocument();
        expect(card("Work mix").getByText("Work mix data unavailable.")).toBeInTheDocument();
    });
});

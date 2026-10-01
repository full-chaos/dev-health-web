import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";
import { metricFilterToAIFilter, type AIFilter } from "@/lib/filters/ai";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, encodeFilterParam } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";
import { toAIQueryInputs } from "@/lib/graphql/hooks/useAIReviewRisk";

import AILayout from "../../layout";
import AIImpactEvidencePage from "./page";

// AI / Impact / PR Evidence inside the shared app shell: a detail page of
// Impact. Its trail is "AI / Impact", so it keeps its "Back to Impact" link.

const scopeBarSpy = vi.hoisted(() => vi.fn());
const listSpy = vi.hoisted(() => vi.fn());
const FILTERS: MetricFilter = {
    ...defaultMetricFilter,
    time: { range_days: 30, compare_days: 30 },
    scope: { level: "team", ids: ["platform"] },
    what: { repos: ["org/api"] },
    why: { work_category: ["feature"] },
};
const F = encodeFilterParam(FILTERS);

vi.mock("next/navigation", () => ({
    usePathname: () => "/ai/impact/evidence",
    useSearchParams: () => new URLSearchParams(`f=${F}&role=em`),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: { user: { org_id: "org-1", email: "admin@devhealth.example" } },
        status: "authenticated",
        update: vi.fn(),
    }),
    signOut: vi.fn(),
}));
vi.mock("@/components/shell/ScopeBar", () => ({
    ScopeBar: (props: Record<string, unknown>) => {
        scopeBarSpy(props);
        return <section data-testid="scope-bar" />;
    },
}));
vi.mock("@/components/ai/AIImpactEvidenceList", () => ({
    AIImpactEvidenceList: (props: { filter: AIFilter }) => {
        listSpy(props);
        return <div data-testid="ai-impact-evidence-list" />;
    },
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
// `toAIQueryInputs` is a pure function in the hooks module; the module also
// imports the GraphQL client, which this test does not use.
vi.mock("urql", () => ({ useQuery: vi.fn() }));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org-1" }));

async function renderPage() {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell>
                <AILayout>
                    {await AIImpactEvidencePage({
                        searchParams: Promise.resolve({ f: F, role: "em" }),
                    })}
                </AILayout>
            </AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    scopeBarSpy.mockClear();
    listSpy.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("AI / Impact / PR Evidence in the shared app shell", () => {
    it("has one main, one h1 and the description", async () => {
        await renderPage();

        expect(screen.getAllByRole("main")).toHaveLength(1);
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("PR Evidence");
        expect(
            within(screen.getByTestId("page-header")).getByText(
                "Every AI-attributed pull request behind the Impact rollups, with provenance badges and Work Graph evidence per PR.",
            ),
        ).toBeInTheDocument();
        expect(screen.queryByRole("navigation", { name: "AI views" })).toBeNull();
    });

    it("keeps 'Back to Impact' with the filter and the role: the trail has no link to Impact", async () => {
        await renderPage();

        const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(screen.getAllByRole("navigation", { name: "Breadcrumb" })).toHaveLength(1);
        expect(within(trail).queryByRole("link", { name: "Impact" })).toBeNull();

        const back = within(screen.getByTestId("page-header")).getByRole("link", {
            name: "Back to Impact",
        });
        const url = new URL(back.getAttribute("href") ?? "", "https://app.example");
        expect(url.pathname).toBe("/ai/impact");
        expect(decodeFilter(url.searchParams.get("f"))).toEqual(FILTERS);
        expect(url.searchParams.get("role")).toBe("em");
    });

    it("keeps Impact marked in the sidebar on its detail page", async () => {
        await renderPage();

        expect(
            within(screen.getByTestId("nav-children-ai")).getByRole("link", { name: "Impact" }),
        ).toHaveAttribute("aria-current", "page");
    });

    it("renders one scope bar for the AI view, above the list", async () => {
        await renderPage();

        expect(scopeBarSpy).toHaveBeenCalledWith({ view: "ai" });
        expect(screen.getAllByTestId("scope-bar")).toHaveLength(1);
        expect(
            screen
                .getByTestId("scope-bar")
                .compareDocumentPosition(screen.getByTestId("ai-impact-evidence-list")) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("reads every scope control the bar shows: team, repository, window and work type go into the list query", async () => {
        await renderPage();

        // The rule for the scope bar here: no control that the page does not
        // read. The organization comes from the session (`useOrgId`).
        const filter = listSpy.mock.calls[0][0].filter as AIFilter;
        expect(filter).toEqual(metricFilterToAIFilter(FILTERS));
        const inputs = toAIQueryInputs(filter);
        expect(inputs.scope).toEqual({
            teamId: "platform",
            repoId: "org/api",
            workType: "feature",
            buckets: null,
        });
        const days =
            (Date.parse(inputs.dateRange.endDate) - Date.parse(inputs.dateRange.startDate)) /
            86_400_000;
        expect(days).toBe(29);

        // A wider window changes the query: the window control is read.
        const wider = toAIQueryInputs(
            metricFilterToAIFilter({ ...FILTERS, time: { range_days: 90, compare_days: 90 } }),
        );
        expect(wider.dateRange.startDate).not.toBe(inputs.dateRange.startDate);
    });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";

import PersonPage from "./page";

// A person page inside the shared app shell. It is a DETAIL page: it keeps its
// BackLink to the parent list, its single-person framing and its own range bar,
// and it has no scope bar (it had none).

vi.mock("next/navigation", () => ({
    usePathname: () => "/people/person-1",
    useSearchParams: () => new URLSearchParams(),
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
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/api/people", () => ({
    getPersonSummary: vi.fn().mockResolvedValue({
        person: {
            display_name: "Test Person",
            identities: [{ provider: "github", handle: "test-person" }],
            active: true,
        },
        deltas: [],
        narrative: [],
        sections: {},
        freshness: { last_ingested_at: null, sources: {} },
    }),
}));
vi.mock("@/lib/api/visuals", () => ({ getQuadrant: vi.fn().mockResolvedValue(null) }));
vi.mock("@/components/people/PersonRangeBar", () => ({
    PersonRangeBar: () => <div data-testid="person-range-bar" />,
}));
vi.mock("@/components/charts/DonutChart", () => ({ DonutChart: () => null }));
vi.mock("@/components/charts/HorizontalBarChart", () => ({ HorizontalBarChart: () => null }));
vi.mock("@/components/charts/QuadrantPanel", () => ({ QuadrantPanel: () => null }));
vi.mock("@/components/metrics/MetricCard", () => ({ MetricCard: () => null }));

async function renderPage() {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell>
                {await PersonPage({
                    params: Promise.resolve({ person_id: "person-1" }),
                    searchParams: Promise.resolve({}),
                })}
            </AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("Person page in the shared app shell", () => {
    it("has one main and one h1: the person's name", async () => {
        await renderPage();

        expect(screen.getAllByRole("main")).toHaveLength(1);
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Test Person");
        expect(screen.getByTestId("page-header-eyebrow")).toHaveTextContent("Diagnose / People");
    });

    it("keeps the single-person framing and the identity chips in the header", async () => {
        await renderPage();

        const header = within(screen.getByTestId("page-header"));
        expect(header.getByText("This view is scoped to one person.")).toBeInTheDocument();
        expect(header.getByText("Select a metric to investigate.")).toBeInTheDocument();
        expect(header.getByText("github: test-person")).toBeInTheDocument();
    });

    it("keeps 'Back to People': a detail page returns to its parent list", async () => {
        await renderPage();

        const back = within(screen.getByTestId("page-header")).getByRole("link", {
            name: "Back to People",
        });
        expect(back).toHaveAttribute("href", "/people");
        // The trail's own link goes to the area, so the BackLink is not a duplicate of it.
        const crumb = within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole(
            "link",
            { name: "Diagnose" },
        );
        expect(crumb.getAttribute("href")).toMatch(/^\/diagnose\?/);
    });

    it("keeps its own range bar and has no scope bar", async () => {
        await renderPage();

        expect(screen.getByTestId("person-range-bar")).toBeInTheDocument();
        expect(screen.queryByTestId("scope-bar")).toBeNull();
        expect(screen.queryByTestId("global-context-bar")).toBeNull();
    });
});

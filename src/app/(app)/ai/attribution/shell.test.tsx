import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";
import { metricFilterToAIFilter } from "@/lib/filters/ai";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, encodeFilterParam } from "@/lib/filters/encode";

import AIAttributionPage from "./page";

// AI / Attribution inside the shared app shell. It is a hidden child of AI
// (reachable, not listed): its trail is the area only, with no link, so the
// page has a "Back to AI" link.

const scopeBarSpy = vi.hoisted(() => vi.fn());
const dashboardSpy = vi.hoisted(() => vi.fn());
const FILTERS = { ...defaultMetricFilter, scope: { level: "team" as const, ids: ["platform"] } };
const F = encodeFilterParam(FILTERS);

vi.mock("next/navigation", () => ({
    usePathname: () => "/ai/attribution",
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
vi.mock("@/components/ai/AIAttributionDashboard", () => ({
    AIAttributionDashboard: (props: Record<string, unknown>) => {
        dashboardSpy(props);
        return <div data-testid="ai-attribution-dashboard" />;
    },
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));

async function renderPage() {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell>
                {await AIAttributionPage({
                    searchParams: Promise.resolve({ f: F, role: "em" }),
                })}
            </AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    scopeBarSpy.mockClear();
    dashboardSpy.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("AI / Attribution in the shared app shell", () => {
    it("has one main, one h1 and the description", async () => {
        await renderPage();

        expect(screen.getAllByRole("main")).toHaveLength(1);
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Attribution");
        expect(
            within(screen.getByTestId("page-header")).getByText(
                "How work in this window appears to split across AI-assisted, AI-reviewed, agent-created, and unknown-signal kinds, with the persisted evidence behind every bucket.",
            ),
        ).toBeInTheDocument();
        expect(screen.queryByRole("navigation", { name: "AI views" })).toBeNull();
    });

    it("has 'Back to AI' with the filter and the role: its trail has no link", async () => {
        await renderPage();

        const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(screen.getAllByRole("navigation", { name: "Breadcrumb" })).toHaveLength(1);
        expect(within(trail).queryAllByRole("link")).toHaveLength(0);

        const back = within(screen.getByTestId("page-header")).getByRole("link", {
            name: "Back to AI",
        });
        const url = new URL(back.getAttribute("href") ?? "", "https://app.example");
        expect(url.pathname).toBe("/ai");
        expect(decodeFilter(url.searchParams.get("f"))).toEqual(FILTERS);
        expect(url.searchParams.get("role")).toBe("em");
    });

    it("marks no child in the sidebar on this hidden route, and does not list it", async () => {
        await renderPage();

        const children = screen.getByTestId("nav-children-ai");
        expect(within(children).getAllByRole("link")).toHaveLength(5);
        expect(within(children).queryByRole("link", { name: "Attribution" })).toBeNull();
        expect(children.querySelectorAll('a[aria-current="page"]')).toHaveLength(0);
    });

    it("renders one scope bar for the AI view, above the dashboard, and gives the dashboard the filter", async () => {
        await renderPage();

        // The Attribution query scope has no work type (CHAOS-7744): no page filters, no Work control.
        expect(scopeBarSpy).toHaveBeenCalledWith({ view: "ai", pageFilters: false });
        expect(screen.getAllByTestId("scope-bar")).toHaveLength(1);
        expect(
            screen
                .getByTestId("scope-bar")
                .compareDocumentPosition(screen.getByTestId("ai-attribution-dashboard")) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(dashboardSpy).toHaveBeenCalledWith(
            expect.objectContaining({ filter: metricFilterToAIFilter(FILTERS) }),
        );
    });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, encodeFilterParam } from "@/lib/filters/encode";

import AIImpactPage from "./page";

// AI / Impact inside the shared app shell. The destination title is the page's h1 (it was an h2 under the
// area title "AI").

const scopeBarSpy = vi.hoisted(() => vi.fn());
const dashboardSpy = vi.hoisted(() => vi.fn());
const FILTERS = { ...defaultMetricFilter, scope: { level: "team" as const, ids: ["platform"] } };
const F = encodeFilterParam(FILTERS);

vi.mock("next/navigation", () => ({
    usePathname: () => "/ai/impact",
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
vi.mock("@/components/ai/AIImpactDashboard", () => ({
    AIImpactDashboard: (props: { evidenceHref: string }) => {
        dashboardSpy(props);
        return <div data-testid="ai-impact-dashboard" />;
    },
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));

async function renderPage() {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell>
                {await AIImpactPage({ searchParams: Promise.resolve({ f: F, role: "em" }) })}
            </AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    scopeBarSpy.mockClear();
    dashboardSpy.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("AI / Impact in the shared app shell", () => {
    it("has one main and one h1: the destination title, not the area title", async () => {
        await renderPage();

        expect(screen.getAllByRole("main")).toHaveLength(1);
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Impact");
        expect(screen.getByTestId("page-header-eyebrow")).toHaveTextContent("AI / Impact");
    });

    it("keeps the description text, word for word", async () => {
        await renderPage();

        expect(
            within(screen.getByTestId("page-header")).getByText(
                "Org-wide view of how AI-assisted workflows appear to influence delivery, review load, quality gaps, and operational drag.",
            ),
        ).toBeInTheDocument();
    });

    it("has no AI tab strip, no area header, no 'Back to Cockpit' and one trail", async () => {
        await renderPage();

        expect(screen.queryByRole("navigation", { name: "AI views" })).toBeNull();
        expect(screen.queryByText(/What AI appears to change/)).toBeNull();
        expect(
            within(screen.getByRole("main")).queryByRole("link", { name: /Back to/ }),
        ).toBeNull();
        expect(screen.getAllByRole("navigation", { name: "Breadcrumb" })).toHaveLength(1);
    });

    it("marks Impact as the current page in the sidebar, and the AI crumb keeps the state", async () => {
        await renderPage();

        expect(
            within(screen.getByTestId("nav-children-ai")).getByRole("link", { name: "Impact" }),
        ).toHaveAttribute("aria-current", "page");
        const crumb = within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole(
            "link",
            { name: "AI" },
        );
        const url = new URL(crumb.getAttribute("href") ?? "", "https://app.example");
        expect(url.pathname).toBe("/ai");
        expect(decodeFilter(url.searchParams.get("f"))).toEqual(FILTERS);
        expect(url.searchParams.get("role")).toBe("em");
    });

    it("renders one scope bar for the AI view, above the dashboard", async () => {
        await renderPage();

        // `view: "ai"` and nothing else: the work filter, the team scope lock
        // and the default `f`, as the two old bars had together.
        expect(scopeBarSpy).toHaveBeenCalledWith({ view: "ai" });
        expect(screen.getAllByTestId("scope-bar")).toHaveLength(1);
        expect(
            screen
                .getByTestId("scope-bar")
                .compareDocumentPosition(screen.getByTestId("ai-impact-dashboard")) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("gives the dashboard the evidence link with the filter and the role", async () => {
        await renderPage();

        const href = dashboardSpy.mock.calls[0][0].evidenceHref as string;
        const url = new URL(href, "https://app.example");
        expect(url.pathname).toBe("/ai/impact/evidence");
        expect(decodeFilter(url.searchParams.get("f"))).toEqual(FILTERS);
        expect(url.searchParams.get("role")).toBe("em");
    });
});

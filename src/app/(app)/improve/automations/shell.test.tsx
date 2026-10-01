import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, encodeFilterParam } from "@/lib/filters/encode";

import ImproveAutomationsPage from "./page";

// Improve / Automations inside the shared app shell. Before the move its title
// was an `h2` and the page had no `h1`; the shared header gives it one.

const scopeBarSpy = vi.hoisted(() => vi.fn());
const dashboardSpy = vi.hoisted(() => vi.fn());
const FILTERS = { ...defaultMetricFilter, scope: { level: "team" as const, ids: ["platform"] } };
const F = encodeFilterParam(FILTERS);

vi.mock("next/navigation", () => ({
    usePathname: () => "/improve/automations",
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
vi.mock("@/components/improve/ImproveAutomationsDashboard", () => ({
    ImproveAutomationsDashboard: (props: { aiAutomationsHref: string }) => {
        dashboardSpy(props);
        return <div data-testid="improve-automations-dashboard" />;
    },
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));

async function renderPage() {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell>
                {await ImproveAutomationsPage({
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

describe("Improve / Automations in the shared app shell", () => {
    it("has one main and one h1: the title is the page's h1 now", async () => {
        await renderPage();

        expect(screen.getAllByRole("main")).toHaveLength(1);
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Automations");
        expect(screen.getByTestId("page-header-eyebrow")).toHaveTextContent(
            "Improve / Automations",
        );
    });

    it("keeps the description text, word for word", async () => {
        await renderPage();

        expect(
            within(screen.getByTestId("page-header")).getByText(
                "Non-AI flow opportunities — review latency, cycle time, rework, WIP congestion, throughput, churn, and change failure rate — each firing only when metrics exceed documented thresholds. For AI-workflow automation candidates, see the AI surface.",
            ),
        ).toBeInTheDocument();
    });

    it("has one trail: the in-page breadcrumb trail is gone, and the Improve crumb keeps the state", async () => {
        await renderPage();

        const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(screen.getAllByRole("navigation", { name: "Breadcrumb" })).toHaveLength(1);
        // Area, then the page, each once: no crumb is appended twice.
        expect(trail.textContent?.match(/Improve/g)).toHaveLength(1);
        expect(trail.textContent?.match(/Automations/g)).toHaveLength(1);
        expect(within(trail).getByText("Automations")).toHaveAttribute("aria-current", "page");
        const crumb = within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole(
            "link",
            { name: "Improve" },
        );
        const url = new URL(crumb.getAttribute("href") ?? "", "https://app.example");
        expect(url.pathname).toBe("/improve");
        expect(decodeFilter(url.searchParams.get("f"))).toEqual(FILTERS);
        expect(url.searchParams.get("role")).toBe("em");
    });

    it("renders one scope bar for the opportunities view, above the dashboard", async () => {
        await renderPage();

        expect(scopeBarSpy).toHaveBeenCalledWith({ view: "opportunities" });
        expect(screen.getAllByTestId("scope-bar")).toHaveLength(1);
        expect(
            screen
                .getByTestId("scope-bar")
                .compareDocumentPosition(screen.getByTestId("improve-automations-dashboard")) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("gives the dashboard the AI automations link with the filter and the role", async () => {
        await renderPage();

        const href = dashboardSpy.mock.calls[0][0].aiAutomationsHref as string;
        const url = new URL(href, "https://app.example");
        expect(url.pathname).toBe("/ai/automations");
        expect(decodeFilter(url.searchParams.get("f"))).toEqual(FILTERS);
        expect(url.searchParams.get("role")).toBe("em");
    });
});

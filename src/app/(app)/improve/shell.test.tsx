import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, encodeFilterParam } from "@/lib/filters/encode";

import ImprovePage from "./page";

// The Improve overview inside the shared app shell: the layout owns the
// navigation and `<main>`; the page brings the shared header and one scope bar.

const scopeBarSpy = vi.hoisted(() => vi.fn());
const areaOverviewSpy = vi.hoisted(() => vi.fn());
const FILTERS = { ...defaultMetricFilter, scope: { level: "team" as const, ids: ["platform"] } };
const F = encodeFilterParam(FILTERS);

vi.mock("next/navigation", () => ({
    usePathname: () => "/improve",
    useSearchParams: () => new URLSearchParams(`f=${F}&role=em&lens=pm`),
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
vi.mock("@/components/navigation/AreaOverview", () => ({
    AreaOverview: (props: Record<string, unknown>) => {
        areaOverviewSpy(props);
        return <div data-testid="area-overview" />;
    },
}));
vi.mock("@/lib/areaSignals", () => ({ getAreaSignals: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/config", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/config")>()),
    getServerEnv: () => ({ DEV_HEALTH_TEST_MODE: "true" }),
}));

async function renderPage() {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell>
                {await ImprovePage({ searchParams: Promise.resolve({ f: F, role: "em" }) })}
            </AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    scopeBarSpy.mockClear();
    areaOverviewSpy.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("Improve overview in the shared app shell", () => {
    it("has one main, one h1 and one sidebar", async () => {
        await renderPage();

        expect(screen.getAllByRole("main")).toHaveLength(1);
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Improve");
        expect(document.querySelectorAll("aside")).toHaveLength(1);
    });

    it("keeps the header text, with the eyebrow from the navigation trail", async () => {
        await renderPage();

        expect(screen.getByTestId("page-header-eyebrow")).toHaveTextContent("Improve / Overview");
        expect(
            within(screen.getByTestId("page-header")).getByText(
                "Opportunities, experiments, and automations — each producing actions, not dashboards.",
            ),
        ).toBeInTheDocument();
    });

    it("has no in-page 'Back to Home': the sidebar Home entry is the return path, with the state", async () => {
        await renderPage();

        expect(
            within(screen.getByRole("main")).queryByRole("link", { name: /Back to/ }),
        ).toBeNull();
        const cockpit = screen.getByRole("link", { name: /^Home$/ });
        const url = new URL(cockpit.getAttribute("href") ?? "", "https://app.example");
        expect(url.pathname).toBe("/dashboard");
        expect(decodeFilter(url.searchParams.get("f"))).toEqual(FILTERS);
        expect(url.searchParams.get("role")).toBe("em");
        expect(url.searchParams.get("lens")).toBe("pm");
    });

    it("renders one scope bar with no page filters, above the workflows: the page had the global context bar alone", async () => {
        await renderPage();

        expect(scopeBarSpy).toHaveBeenCalledWith({ pageFilters: false });
        expect(screen.getAllByTestId("scope-bar")).toHaveLength(1);
        expect(
            screen
                .getByTestId("scope-bar")
                .compareDocumentPosition(screen.getByTestId("area-overview")) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("gives the filter and the role to the workflow cards, as before", async () => {
        await renderPage();

        expect(areaOverviewSpy).toHaveBeenCalledWith(
            expect.objectContaining({ areaId: "improve", filters: FILTERS, role: "em" }),
        );
    });
});

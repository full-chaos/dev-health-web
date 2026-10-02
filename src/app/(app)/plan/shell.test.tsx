import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";

import PlanPage from "./page";

// The Plan overview inside the shared app shell: the layout owns the navigation
// and `<main>`; the page brings the shared header and one scope bar.

const scopeBarSpy = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
    usePathname: () => "/plan",
    useSearchParams: () => new URLSearchParams("role=em"),
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
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/auth", () => ({
    requireSession: vi.fn().mockResolvedValue({ user: { org_id: "org-1" } }),
}));
vi.mock("@/lib/graphql/capacityFetchers", () => ({
    getThroughputForecastViaGraphQL: vi.fn().mockResolvedValue(null),
}));

async function renderPage() {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell>
                {await PlanPage({
                    searchParams: Promise.resolve({ role: "em", origin: "cockpit" }),
                })}
            </AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    scopeBarSpy.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("Plan overview in the shared app shell", () => {
    it("has one main, one h1 and one sidebar", async () => {
        await renderPage();

        expect(screen.getAllByRole("main")).toHaveLength(1);
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Overview");
        expect(document.querySelectorAll("aside")).toHaveLength(1);
        expect(screen.getAllByRole("navigation", { name: "Primary areas" })).toHaveLength(1);
    });

    it("keeps the header text, with the eyebrow from the navigation trail", async () => {
        await renderPage();

        const header = within(screen.getByTestId("page-header"));
        expect(screen.getByTestId("page-header-eyebrow")).toHaveTextContent("Plan / Overview");
        expect(
            header.getByText(
                "Forecast — not a commitment. Uses rolling 4/8/12-week throughput and risk overlays. Backlog and scope are derived from the filter bar.",
            ),
        ).toBeInTheDocument();
        expect(
            within(screen.getByRole("main")).queryByRole("link", { name: /Back to/ }),
        ).toBeNull();
    });

    it("renders one scope bar for the capacity view, with the origin, above the content", async () => {
        await renderPage();

        expect(scopeBarSpy).toHaveBeenCalledWith({
            view: "capacity-planning",
            origin: "cockpit",
        });
        expect(screen.getAllByTestId("scope-bar")).toHaveLength(1);
        const bar = screen.getByTestId("scope-bar");
        const content = screen.getByText("No forecast available");
        expect(
            bar.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("keeps the Plan area open in the sidebar with Overview as the current page", async () => {
        await renderPage();

        const children = screen.getByTestId("nav-children-plan");
        expect(within(children).getByRole("link", { name: "Overview" })).toHaveAttribute(
            "aria-current",
            "page",
        );
    });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, encodeFilterParam } from "@/lib/filters/encode";

import OperatingReviewPage from "./page";

// The Operating Review inside the shared app shell. It is a hidden child of
// Plan: its trail is the area only, with no link, so the page keeps its
// "Back to Plan" link (the A5 rule removes a back link only when it repeats the
// last breadcrumb link).

const scopeBarSpy = vi.hoisted(() => vi.fn());
const FILTERS = { ...defaultMetricFilter, scope: { level: "team" as const, ids: ["platform"] } };
const F = encodeFilterParam(FILTERS);

vi.mock("next/navigation", () => ({
    usePathname: () => "/operating-review",
    useSearchParams: () => new URLSearchParams(`f=${F}&origin=cockpit`),
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
    auth: vi.fn().mockResolvedValue({ user: { org_id: "org-1" } }),
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("@/lib/graphql/operatingReviewFetchers", () => ({
    getOperatingReviewViaGraphQL: vi.fn().mockRejectedValue(new Error("no backend")),
}));

async function renderPage() {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell>
                {await OperatingReviewPage({
                    searchParams: Promise.resolve({ f: F, origin: "cockpit" }),
                })}
            </AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    scopeBarSpy.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("Operating Review in the shared app shell", () => {
    it("has one main, one h1 and both header lines", async () => {
        await renderPage();

        expect(screen.getAllByRole("main")).toHaveLength(1);
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Operating Review");
        expect(headings[0]).not.toHaveTextContent("Engineering");
        const header = within(screen.getByTestId("page-header"));
        expect(
            header.getByText(
                "A Monday-ready agenda for delivery movement, bottlenecks, risk, reliability, investment, and recommendations.",
            ),
        ).toBeInTheDocument();
        expect(
            header.getByText("Each callout compares the selected week against the prior week."),
        ).toBeInTheDocument();
    });

    it("shows a Preview pill and no back link: the breadcrumb is the way back", async () => {
        await renderPage();

        const header = within(screen.getByTestId("page-header"));
        expect(header.getByTestId("operating-review-preview-pill")).toHaveTextContent("Preview");
        expect(header.queryByRole("link", { name: "Back to Plan" })).toBeNull();
        const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(within(trail).getByText("Plan")).toHaveAttribute("aria-current", "page");
        // The Plan area stays one click away in the sidebar.
        expect(screen.getByTestId("nav-children-plan")).toBeInTheDocument();
    });

    it("has no in-page breadcrumb trail: the top bar has the one trail", async () => {
        await renderPage();

        expect(screen.getAllByRole("navigation", { name: "Breadcrumb" })).toHaveLength(1);
        expect(
            within(screen.getByRole("main")).queryByRole("navigation", { name: "Breadcrumb" }),
        ).toBeNull();
    });

    it("renders one scope bar for the capacity view, with the origin", async () => {
        await renderPage();

        expect(scopeBarSpy).toHaveBeenCalledWith({
            view: "capacity-planning",
            origin: "cockpit",
        });
        expect(screen.getAllByTestId("scope-bar")).toHaveLength(1);
    });

    it("keeps the Plan area selected in the sidebar on this hidden route", async () => {
        await renderPage();

        const children = screen.getByTestId("nav-children-plan");
        expect(within(children).queryByRole("link", { name: /Operating Review/ })).toBeNull();
        expect(within(children).getByRole("link", { name: "Overview" })).toBeInTheDocument();
    });
});

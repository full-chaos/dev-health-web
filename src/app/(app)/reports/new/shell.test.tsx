import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { encodeFilterParam } from "@/lib/filters/encode";

import NewReportPage from "./page";

// Create Report inside the shared app shell. Its trail is "Reports" with no
// link, so the page keeps a return link: "Back to Reports" (it was an icon
// with no accessible name). The page reads no query param.

const DEFAULT_F = encodeFilterParam(defaultMetricFilter);
const TEAM_F = encodeFilterParam({
    ...defaultMetricFilter,
    scope: { level: "team", ids: ["platform"] },
});

vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org-session-1" }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/reports/new",
    useSearchParams: () => new URLSearchParams(`f=${TEAM_F}`),
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
vi.mock("@/lib/reports/fetchers", () => ({ createSavedReport: vi.fn() }));

function renderPage() {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell>
                <NewReportPage />
            </AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("Create Report in the shared app shell", () => {
    it("has one main, one h1 and the subtitle, inside the shell", () => {
        renderPage();

        expect(screen.getByTestId("app-shell")).toContainElement(
            screen.getByTestId("shell-sidebar"),
        );
        expect(screen.getAllByRole("main")).toHaveLength(1);
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Create Report");
        expect(
            within(screen.getByTestId("page-header")).getByText(
                "Define a new AI-generated report.",
            ),
        ).toBeInTheDocument();
    });

    it("has 'Back to Reports' with an accessible name and the same target", () => {
        renderPage();

        expect(
            within(screen.getByTestId("page-header")).getByRole("link", {
                name: "Back to Reports",
            }),
        ).toHaveAttribute("href", "/reports");
        const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(trail).toHaveTextContent("Reports");
        expect(within(trail).queryAllByRole("link")).toHaveLength(0);
    });

    it("keeps the form", () => {
        renderPage();

        expect(screen.getByRole("heading", { name: "Basic Details" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Configuration" })).toBeInTheDocument();
    });

    it("gives the sidebar links the default metric filter, as the page-level navigation did", () => {
        renderPage();

        const links = within(screen.getByRole("navigation", { name: "Primary areas" }))
            .getAllByRole("link")
            .filter((link) => (link.getAttribute("href") ?? "").includes("f="));
        expect(links.length).toBeGreaterThan(5);
        for (const link of links) {
            const url = new URL(link.getAttribute("href") ?? "", "https://app.example");
            expect(url.searchParams.get("f"), url.pathname).toBe(DEFAULT_F);
        }
    });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";
import { CTA_LABELS } from "@/lib/design/cta";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, encodeFilterParam } from "@/lib/filters/encode";

import ReportsPage from "./page";

// Report Center inside the shared app shell. Ruling R-1 = A: no scope bar
// (the page reads no filter for its data); the global context bar goes and
// nothing replaces it.

const FILTERS = { ...defaultMetricFilter, scope: { level: "team" as const, ids: ["platform"] } };
const F = encodeFilterParam(FILTERS);

vi.mock("next/navigation", () => ({
    usePathname: () => "/reports",
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
vi.mock("@/lib/reports/fetchers", () => ({
    fetchSavedReportsChecked: vi.fn().mockResolvedValue({ items: [], total: 0, error: false }),
}));
vi.mock("@/lib/config", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/config")>()),
    getServerEnv: () => ({ DEV_HEALTH_TEST_MODE: "true" }),
}));

async function renderPage() {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell>{await ReportsPage()}</AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("Report Center in the shared app shell", () => {
    it("has one main, one h1 and one sidebar", async () => {
        await renderPage();

        expect(screen.getAllByRole("main")).toHaveLength(1);
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Report Center");
        expect(document.querySelectorAll("aside")).toHaveLength(1);
        expect(screen.getByTestId("app-shell")).toContainElement(
            screen.getByTestId("shell-sidebar"),
        );
    });

    it("keeps the subtitle and has 'New Report' in the header actions", async () => {
        await renderPage();

        const header = within(screen.getByTestId("page-header"));
        expect(
            header.getByText("Create, manage, and schedule AI-generated reports."),
        ).toBeInTheDocument();
        expect(header.getByRole("link", { name: CTA_LABELS.newReport })).toHaveAttribute(
            "href",
            "/reports/new",
        );
        expect(screen.getByTestId("page-header-eyebrow")).toHaveTextContent(
            "Reports / Report Center",
        );
    });

    it("has no scope bar and no global context bar (R-1 = A)", async () => {
        await renderPage();

        expect(screen.queryByTestId("scope-bar")).toBeNull();
        expect(screen.queryByTestId("global-context-bar")).toBeNull();
        expect(screen.queryByRole("region", { name: "Global context" })).toBeNull();
    });

    it("keeps the filter and the role of the URL in the sidebar links, as before", async () => {
        await renderPage();

        const home = within(screen.getByRole("navigation", { name: "Primary areas" }))
            .getAllByRole("link")
            .find(
                (link) =>
                    new URL(link.getAttribute("href") ?? "", "https://app.example").pathname ===
                    "/dashboard",
            );
        const url = new URL(home?.getAttribute("href") ?? "", "https://app.example");
        expect(decodeFilter(url.searchParams.get("f"))).toEqual(FILTERS);
        expect(url.searchParams.get("role")).toBe("em");
    });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";

import UserPreferencesPage from "./page";

// CHAOS-7966 (AD-1 option A): the personal preferences page is the Admin destination
// "Settings" in the shared app shell. Its centred frame and in-page trail are gone.

vi.mock("next/navigation", () => ({
    usePathname: () => "/settings",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
// The preference controls are not under test here (they read the browser's media queries).
vi.mock("@/components/settings/PreferencesSettings", () => ({
    PreferencesSettings: () => <p>Preference controls</p>,
}));
vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: { user: { org_id: "org-1", email: "admin@devhealth.example" } },
        status: "authenticated",
        update: vi.fn(),
    }),
    signOut: vi.fn(),
}));

function renderPage() {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell>
                <UserPreferencesPage />
            </AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("Preferences in the shared app shell (CHAOS-7966)", () => {
    it("has one sidebar, one main and one h1 'Settings' with its subtitle", () => {
        renderPage();

        expect(document.querySelectorAll("aside")).toHaveLength(1);
        expect(screen.getAllByRole("main")).toHaveLength(1);
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
        const header = screen.getByTestId("page-header");
        expect(within(header).getByRole("heading", { level: 1 })).toHaveTextContent("Settings");
        expect(
            within(header).getByText("Personal display settings stored in your browser."),
        ).toBeInTheDocument();
    });

    it("marks Settings in the expanded Admin area; the in-page trail is gone", () => {
        renderPage();

        expect(
            within(screen.getByTestId("nav-children-admin")).getByRole("link", {
                name: "Settings",
            }),
        ).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent(
            "Admin/Settings",
        );
        const main = screen.getByRole("main");
        expect(within(main).queryByRole("link", { name: "Dashboard" })).toBeNull();
        expect(within(main).queryByText(/\/ Preferences/)).toBeNull();
        // Settings has no tab row.
        expect(screen.queryByRole("tablist")).toBeNull();
    });

    it("lets the settings card use the full column width (CHAOS-8257)", () => {
        renderPage();
        expect(screen.getByTestId("settings-page").className).not.toMatch(/max-w-/);
    });
});

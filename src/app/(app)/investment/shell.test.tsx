import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";

import InvestmentPage from "./page";

// Investment inside the shared app shell. The page lost its own navigation and
// its "Back to Diagnose" link, so this file proves, by behaviour, the property
// the old source checks stood for: the role context (and the filter and origin
// scope) survives on standalone /investment in the sidebar links, in the
// Diagnose crumb and in every in-page link that is left.

const scopeBarSpy = vi.hoisted(() => vi.fn());
const gatedBodySpy = vi.hoisted(() => vi.fn());
const SEARCH = "role=em&origin=cockpit";

vi.mock("next/navigation", () => ({
    usePathname: () => "/investment",
    useSearchParams: () => new URLSearchParams(SEARCH),
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
vi.mock("./_components/InvestmentGatedBody", () => ({
    InvestmentGatedBody: (props: Record<string, unknown>) => {
        gatedBodySpy(props);
        return <div data-testid="investment-body" />;
    },
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/admin/server", () => ({
    getCurrentOrg: vi.fn().mockResolvedValue({ data: { id: "org-1" } }),
    getOrgEntitlements: vi
        .fn()
        .mockResolvedValue({ data: { features: { investment_view: true } } }),
}));
vi.mock("@/lib/graphql/homeFetchers", () => ({
    getHomeDataViaGraphQL: vi.fn().mockResolvedValue(null),
}));

async function renderPage() {
    return render(
        <AdminTierProvider tier="team" features={{ investment_view: true }}>
            <AppShell>
                {await InvestmentPage({
                    searchParams: Promise.resolve({ role: "em", origin: "cockpit" }),
                })}
            </AppShell>
        </AdminTierProvider>,
    );
}

function paramsOf(link: HTMLElement) {
    return new URL(link.getAttribute("href") ?? "", "https://app.example");
}

beforeEach(() => {
    scopeBarSpy.mockClear();
    gatedBodySpy.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("Investment in the shared app shell", () => {
    it("has one main, one h1 and the header text it had", async () => {
        await renderPage();

        expect(screen.getAllByRole("main")).toHaveLength(1);
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Investment");
        expect(screen.getByTestId("page-header-eyebrow")).toHaveTextContent(
            "Diagnose / Investment",
        );
        const header = within(screen.getByTestId("page-header"));
        expect(
            header.getByText("Effort and attention allocation over the selected window."),
        ).toBeInTheDocument();
        expect(header.getByText("Select a segment to investigate.")).toBeInTheDocument();
    });

    it("keeps the perspective note, the tabs and the body", async () => {
        await renderPage();

        expect(screen.getByText("Perspective:")).toBeInTheDocument();
        expect(
            screen.getByText(/Investment reflects effort and attention \(not spend\)/),
        ).toBeInTheDocument();
        expect(screen.getByRole("tablist", { name: "Investment views" })).toBeInTheDocument();
        expect(screen.getByTestId("investment-body")).toBeInTheDocument();
    });

    it("has one scope bar for the investment view, with the origin, before the note", async () => {
        await renderPage();

        expect(scopeBarSpy).toHaveBeenCalledWith({ view: "investment", origin: "cockpit" });
        expect(screen.getAllByTestId("scope-bar")).toHaveLength(1);
        const bar = screen.getByTestId("scope-bar");
        const note = screen.getByText("Perspective:");
        expect(bar.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("has the 'Inspect associations' action in the header's actions slot", async () => {
        await renderPage();

        const action = within(screen.getByTestId("page-header-actions")).getByRole("link", {
            name: "Inspect associations",
        });
        expect(paramsOf(action).pathname).toBe("/explore");
        expect(paramsOf(action).searchParams.get("metric")).toBe("throughput");
    });

    it("has no in-page BackLink: the Diagnose crumb is the return path", async () => {
        await renderPage();

        expect(
            within(screen.getByRole("main")).queryByRole("link", { name: /Back to/ }),
        ).toBeNull();
    });
});

describe("Investment — role context survives on standalone /investment", () => {
    it("in every sidebar link", async () => {
        await renderPage();

        const links = within(screen.getByTestId("shell-sidebar"))
            .getAllByRole("link")
            .filter((link) => link.getAttribute("href")?.includes("?"));
        expect(links.length).toBeGreaterThan(10);
        for (const link of links) {
            expect(paramsOf(link).searchParams.get("role"), link.textContent ?? "").toBe("em");
            expect(paramsOf(link).searchParams.has("f"), link.textContent ?? "").toBe(true);
        }
    });

    it("in the Diagnose crumb, the way back to the IA parent, with the filter and the origin", async () => {
        await renderPage();

        const crumb = within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole(
            "link",
            { name: "Diagnose" },
        );
        const url = paramsOf(crumb);
        expect(url.pathname).toBe("/diagnose");
        expect(url.searchParams.has("f")).toBe(true);
        expect(url.searchParams.get("role")).toBe("em");
        expect(url.searchParams.get("origin")).toBe("cockpit");
    });

    it("in every in-page link that is left: the header action and the tabs", async () => {
        await renderPage();

        const main = within(screen.getByRole("main"));
        const action = main.getByRole("link", { name: "Inspect associations" });
        expect(paramsOf(action).searchParams.get("role")).toBe("em");
        expect(paramsOf(action).searchParams.get("origin")).toBe("cockpit");

        const tabs = within(screen.getByRole("tablist", { name: "Investment views" })).getAllByRole(
            "tab",
        );
        expect(tabs.map((tab) => tab.textContent)).toEqual([
            "Overview",
            "Allocation",
            "Evidence",
            "Confidence",
        ]);
        for (const tab of tabs) {
            const url = paramsOf(tab);
            expect(url.searchParams.get("role"), tab.textContent ?? "").toBe("em");
            expect(url.searchParams.get("origin"), tab.textContent ?? "").toBe("cockpit");
            expect(url.searchParams.has("f"), tab.textContent ?? "").toBe(true);
        }
    });

    it("in the body, which gets the role as a prop", async () => {
        await renderPage();

        expect(gatedBodySpy).toHaveBeenCalledWith(
            expect.objectContaining({ activeRole: "em", enabled: true }),
        );
    });
});

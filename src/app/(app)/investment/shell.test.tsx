import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { EvidenceDrawerProvider } from "@/components/evidence/EvidenceDrawerProvider";
import { AppShell } from "@/components/shell/AppShell";

import InvestmentPage from "./page";

// Investment inside the shared app shell. The page lost its own navigation and
// its "Back to Diagnose" link, so this file proves, by behaviour, the property
// the old source checks stood for: the role context (and the filter and origin
// scope) survives on standalone /investment in the sidebar links, in the
// Diagnose crumb and in every in-page link that is left.
//
// Layout (approved prototype, views 5 to 10): one subtitle per tab, the "View evidence" header
// action, and the perspective notice under the tabs.

const scopeBarSpy = vi.hoisted(() => vi.fn());
const gatedBodySpy = vi.hoisted(() => vi.fn());
const evidencePanelSpy = vi.hoisted(() => vi.fn());
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
// The request path of the shared drawer: this file checks which subject it is opened for.
vi.mock("@/components/evidence/EvidencePanel", () => ({
    EvidencePanel: (props: Record<string, unknown>) => {
        evidencePanelSpy(props);
        return <div data-testid="evidence-panel" />;
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

async function renderPage(tab?: string) {
    return render(
        <AdminTierProvider tier="team" features={{ investment_view: true }}>
            <EvidenceDrawerProvider>
                <AppShell>
                    {await InvestmentPage({
                        searchParams: Promise.resolve({
                            role: "em",
                            origin: "cockpit",
                            ...(tab ? { tab } : {}),
                        }),
                    })}
                </AppShell>
            </EvidenceDrawerProvider>
        </AdminTierProvider>,
    );
}

function paramsOf(link: HTMLElement) {
    return new URL(link.getAttribute("href") ?? "", "https://app.example");
}

beforeEach(() => {
    scopeBarSpy.mockClear();
    gatedBodySpy.mockClear();
    evidencePanelSpy.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("Investment in the shared app shell", () => {
    it("has one main, one h1 and the header text of the Overview tab", async () => {
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
        // The legacy meta line under the subtitle is gone.
        expect(screen.queryByText("Select a segment to investigate.")).toBeNull();
    });

    it("has one subtitle per tab (approved prototype, views 5 to 10)", async () => {
        const subtitles: Record<string, string> = {
            overview: "Effort and attention allocation over the selected window.",
            allocation: "How effort is distributed across teams, repositories, and themes.",
            evidence: "The work units behind the investment mix.",
            confidence:
                "Classification confidence, evidence quality, attribution coverage, and rework.",
        };
        for (const [tab, subtitle] of Object.entries(subtitles)) {
            const { unmount } = await renderPage(tab);
            const header = within(screen.getByTestId("page-header"));
            expect(header.getByText(subtitle), tab).toBeInTheDocument();
            expect(gatedBodySpy, tab).toHaveBeenLastCalledWith(
                expect.objectContaining({ activeTab: tab }),
            );
            unmount();
        }
    });

    it("has the perspective notice with the prototype text, the tabs and the body", async () => {
        await renderPage();

        const notice = screen.getByTestId("investment-perspective");
        expect(notice).toHaveAttribute("data-notice-variant", "info");
        expect(notice).toHaveTextContent(
            "Investment reflects effort and attention—not spend. Allocation paths move from allocation to streams to items.",
        );
        // Static guidance: not announced as a status update.
        expect(notice).not.toHaveAttribute("role");
        // The legacy "Perspective:" box and its wording are gone.
        expect(screen.queryByText("Perspective:")).toBeNull();
        expect(screen.queryByText(/\(not spend\)/)).toBeNull();
        expect(screen.getByRole("tablist", { name: "Investment views" })).toBeInTheDocument();
        expect(screen.getByTestId("investment-body")).toBeInTheDocument();
    });

    it("order: one scope bar (with the origin), then the tabs, then the notice, then the body", async () => {
        await renderPage();

        expect(scopeBarSpy).toHaveBeenCalledWith({ view: "investment", origin: "cockpit" });
        expect(screen.getAllByTestId("scope-bar")).toHaveLength(1);
        const order = [
            screen.getByTestId("scope-bar"),
            screen.getByRole("tablist", { name: "Investment views" }),
            screen.getByTestId("investment-perspective"),
            screen.getByTestId("investment-body"),
        ];
        for (let i = 0; i < order.length - 1; i += 1) {
            expect(
                order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING,
                `block ${i} before block ${i + 1}`,
            ).toBeTruthy();
        }
    });

    it("has one header action, 'View evidence', and no 'Inspect associations' pill", async () => {
        await renderPage();

        const actions = within(screen.getByTestId("page-header-actions"));
        expect(actions.getAllByRole("button")).toHaveLength(1);
        expect(actions.getByRole("button", { name: "View evidence" })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Inspect associations" })).toBeNull();
    });

    it("View evidence opens the shared drawer for the throughput metric (the former header link's subject), with the role", async () => {
        await renderPage();
        expect(screen.queryByTestId("evidence-panel")).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "View evidence" }));

        expect(screen.getByTestId("evidence-panel")).toBeInTheDocument();
        const props = evidencePanelSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
        // The drawer footer links to /explore?metric=throughput with this role (see EvidencePanel).
        expect(props).toMatchObject({ title: "Throughput", metric: "throughput", role: "em" });
        expect(props.filters).toBeDefined();
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

    it("in every in-page link that is left: the tabs (the header action is now a drawer button)", async () => {
        await renderPage();

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

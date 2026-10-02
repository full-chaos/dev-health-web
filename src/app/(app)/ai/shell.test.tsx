import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, encodeFilterParam } from "@/lib/filters/encode";

import AIWorkflowsPage from "./page";

// The AI overview inside the shared app shell. The area header (title "AI" and its lede) is on this page
// only; the five AI destinations are the sidebar children, not a tab strip.

const scopeBarSpy = vi.hoisted(() => vi.fn());
const areaHubSpy = vi.hoisted(() => vi.fn());
const FILTERS = { ...defaultMetricFilter, scope: { level: "team" as const, ids: ["platform"] } };
const F = encodeFilterParam(FILTERS);

vi.mock("next/navigation", () => ({
    usePathname: () => "/ai",
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
vi.mock("@/components/navigation/AreaHub", () => ({
    AreaHub: (props: Record<string, unknown>) => {
        areaHubSpy(props);
        return <div data-testid="area-hub" />;
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
                {await AIWorkflowsPage({
                    searchParams: Promise.resolve({ f: F, role: "em" }),
                })}
            </AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    scopeBarSpy.mockClear();
    areaHubSpy.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("AI overview in the shared app shell", () => {
    it("has one main, one h1 and one sidebar: no second chrome", async () => {
        await renderPage();

        expect(screen.getAllByRole("main")).toHaveLength(1);
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("AI");
        expect(document.querySelectorAll("aside")).toHaveLength(1);
        expect(screen.getAllByRole("navigation", { name: "Primary areas" })).toHaveLength(1);
    });

    it("keeps the area header text, with the eyebrow from the navigation trail", async () => {
        await renderPage();

        expect(screen.getByTestId("page-header-eyebrow")).toHaveTextContent("AI / Overview");
        expect(
            within(screen.getByTestId("page-header")).getByText(
                "What AI appears to change across delivery, review, quality, and governance. Open an evidence-backed view for the selected window.",
            ),
        ).toBeInTheDocument();
    });

    it("has no AI tab strip: the sidebar lists the same five destinations, in the same order, with the state", async () => {
        await renderPage();

        expect(screen.queryByRole("navigation", { name: "AI views" })).toBeNull();
        const links = within(screen.getByTestId("nav-children-ai")).getAllByRole("link");
        expect(links.map((link) => link.textContent)).toEqual([
            "Overview",
            "Impact",
            "Review Load",
            "Governance Risk",
            "Automations",
        ]);
        expect(
            links.map((link) => new URL(link.getAttribute("href") ?? "", "https://x").pathname),
        ).toEqual(["/ai", "/ai/impact", "/ai/review-load", "/ai/risk", "/ai/automations"]);
        for (const link of links) {
            const url = new URL(link.getAttribute("href") ?? "", "https://x");
            expect(decodeFilter(url.searchParams.get("f")), link.textContent ?? "").toEqual(
                FILTERS,
            );
            expect(url.searchParams.get("role")).toBe("em");
            expect(url.searchParams.get("lens")).toBe("pm");
        }
        expect(links[0]).toHaveAttribute("aria-current", "page");
    });

    it("has no in-page back link: the sidebar entry of the home page is the return path, with the state", async () => {
        await renderPage();

        expect(
            within(screen.getByRole("main")).queryByRole("link", { name: /Back to/ }),
        ).toBeNull();
        // Found by its target, not by its label.
        const home = within(screen.getByRole("navigation", { name: "Primary areas" }))
            .getAllByRole("link")
            .find(
                (link) =>
                    new URL(link.getAttribute("href") ?? "", "https://app.example").pathname ===
                    "/dashboard",
            );
        expect(home).toBeDefined();
        const url = new URL(home?.getAttribute("href") ?? "", "https://app.example");
        expect(decodeFilter(url.searchParams.get("f"))).toEqual(FILTERS);
        expect(url.searchParams.get("role")).toBe("em");
    });

    it("renders one scope bar for the AI view, above the overview", async () => {
        await renderPage();

        // `view: "ai"` and nothing else: the work filter, the team scope lock
        // and the default `f`, as the two old bars had together.
        expect(scopeBarSpy).toHaveBeenCalledWith({ view: "ai" });
        expect(screen.getAllByTestId("scope-bar")).toHaveLength(1);
        expect(
            screen
                .getByTestId("scope-bar")
                .compareDocumentPosition(screen.getByTestId("area-hub")) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("gives the filter and the role to the overview cards, as before", async () => {
        await renderPage();

        expect(areaHubSpy).toHaveBeenCalledWith(
            expect.objectContaining({ areaId: "ai", filters: FILTERS, role: "em" }),
        );
    });
});

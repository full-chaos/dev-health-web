import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, encodeFilterParam } from "@/lib/filters/encode";

import AIRiskPage from "./page";

// AI / Governance Risk inside the shared app shell. The page keeps its one tab row (Overview, Test Gaps,
// Evidence); the area tab strip above it is gone.

const scopeBarSpy = vi.hoisted(() => vi.fn());
const navigation = vi.hoisted(() => ({ search: "" }));
const FILTERS = { ...defaultMetricFilter, scope: { level: "team" as const, ids: ["platform"] } };
const F = encodeFilterParam(FILTERS);

vi.mock("next/navigation", () => ({
    usePathname: () => "/ai/risk",
    useSearchParams: () => new URLSearchParams(navigation.search),
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
vi.mock("@/components/ai/AIRiskDashboard", () => ({
    AIRiskDashboard: () => <div data-testid="ai-risk-dashboard" />,
}));
vi.mock("@/components/ai/AITestGapsPanel", () => ({
    AITestGapsPanel: () => <div data-testid="ai-test-gaps-panel" />,
}));
vi.mock("@/components/ai/AIEvidencePanel", () => ({
    AIEvidencePanel: () => <div data-testid="ai-evidence-panel" />,
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));

async function renderPage(view?: string) {
    navigation.search = `f=${F}&role=em${view ? `&view=${view}` : ""}`;
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell>
                {await AIRiskPage({
                    searchParams: Promise.resolve({
                        f: F,
                        role: "em",
                        ...(view ? { view } : {}),
                    }),
                })}
            </AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    scopeBarSpy.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("AI / Governance Risk in the shared app shell", () => {
    it("has one main and one h1: the destination title, not the area title", async () => {
        await renderPage();

        expect(screen.getAllByRole("main")).toHaveLength(1);
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Governance Risk");
        expect(screen.getByTestId("page-header-eyebrow")).toHaveTextContent("AI / Governance Risk");
    });

    it("has ONE tab row: the views of the page; the area tab strip is gone", async () => {
        await renderPage();

        expect(screen.queryByRole("navigation", { name: "AI views" })).toBeNull();
        const tabs = screen.getByRole("navigation", { name: "Governance Risk views" });
        expect(
            within(tabs)
                .getAllByRole("link")
                .map((link) => link.textContent),
        ).toEqual(["Overview", "Test Gaps", "Evidence"]);
        expect(screen.getByTestId("ai-risk-dashboard")).toBeInTheDocument();
    });

    it.each([
        [
            undefined,
            "Quality-risk diagnostics for AI-associated work, including baseline deltas, explicit missing-data states, and governance findings.",
            "ai-risk-dashboard",
        ],
        [
            "test-gaps",
            "Where AI-attributed change appears to land without matching test coverage signals, with the human baseline alongside.",
            "ai-test-gaps-panel",
        ],
        [
            "evidence",
            "The Work Graph evidence trail behind AI governance signals, explorable per AI-attributed pull request.",
            "ai-evidence-panel",
        ],
    ])("view %s: shows its own description and its own panel", async (view, lede, panel) => {
        await renderPage(view);

        expect(within(screen.getByTestId("page-header")).getByText(lede)).toBeInTheDocument();
        expect(screen.getByTestId(panel)).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Governance Risk");
    });

    it("keeps the filter and the role in every view tab: the way back to the overview keeps the scope", async () => {
        await renderPage("test-gaps");

        const tabs = screen.getByRole("navigation", { name: "Governance Risk views" });
        for (const link of within(tabs).getAllByRole("link")) {
            const url = new URL(link.getAttribute("href") ?? "", "https://app.example");
            expect(url.pathname).toBe("/ai/risk");
            expect(decodeFilter(url.searchParams.get("f")), link.textContent ?? "").toEqual(
                FILTERS,
            );
            expect(url.searchParams.get("role")).toBe("em");
        }
        expect(within(tabs).getByRole("link", { name: "Test Gaps" })).toHaveAttribute(
            "aria-current",
            "page",
        );
    });

    it("has the trail 'AI / Governance Risk' for every view, and one trail", async () => {
        await renderPage("evidence");

        const trails = screen.getAllByRole("navigation", { name: "Breadcrumb" });
        expect(trails).toHaveLength(1);
        expect(trails[0].textContent?.match(/Governance Risk/g)).toHaveLength(1);
        expect(trails[0]).not.toHaveTextContent("Evidence");
        expect(within(trails[0]).getByRole("link", { name: "AI" })).toBeInTheDocument();
    });

    it("renders one scope bar for the AI view, above the tab row", async () => {
        await renderPage();

        expect(scopeBarSpy).toHaveBeenCalledWith({ view: "ai" });
        expect(screen.getAllByTestId("scope-bar")).toHaveLength(1);
        expect(
            screen
                .getByTestId("scope-bar")
                .compareDocumentPosition(
                    screen.getByRole("navigation", { name: "Governance Risk views" }),
                ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });
});

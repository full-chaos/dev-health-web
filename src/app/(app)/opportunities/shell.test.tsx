import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { EvidenceDrawerProvider } from "@/components/evidence/EvidenceDrawerProvider";
import { AppShell } from "@/components/shell/AppShell";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, encodeFilterParam } from "@/lib/filters/encode";

import OpportunitiesPage from "./page";

// Opportunities inside the shared app shell. The Improve crumb in the top bar
// replaces the in-page link back to the Improve overview.

const scopeBarSpy = vi.hoisted(() => vi.fn());
const FILTERS = { ...defaultMetricFilter, scope: { level: "team" as const, ids: ["platform"] } };
const F = encodeFilterParam(FILTERS);

vi.mock("next/navigation", () => ({
    usePathname: () => "/opportunities",
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
vi.mock("@/components/shell/ScopeBar", () => ({
    ScopeBar: (props: Record<string, unknown>) => {
        scopeBarSpy(props);
        return <section data-testid="scope-bar" />;
    },
}));
const getOpportunitiesMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/home", () => ({
    getOpportunities: (...args: unknown[]) => getOpportunitiesMock(...args),
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/config", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/config")>()),
    getServerEnv: () => ({ DEV_HEALTH_TEST_MODE: "true" }),
}));

async function renderPage() {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <EvidenceDrawerProvider>
                <AppShell>
                    {await OpportunitiesPage({
                        searchParams: Promise.resolve({ f: F, role: "em" }),
                    })}
                </AppShell>
            </EvidenceDrawerProvider>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    scopeBarSpy.mockClear();
    getOpportunitiesMock.mockReset();
    getOpportunitiesMock.mockResolvedValue({ items: [] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("Opportunities in the shared app shell", () => {
    it("has one main, one h1 and the subtitle", async () => {
        await renderPage();

        expect(screen.getAllByRole("main")).toHaveLength(1);
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Opportunities");
        expect(screen.getByTestId("page-header-eyebrow")).toHaveTextContent(
            "Improve / Opportunities",
        );
        expect(
            within(screen.getByTestId("page-header")).getByText(
                "Evidence-linked improvement opportunities with clear artifacts and recommended next steps.",
            ),
        ).toBeInTheDocument();
    });

    it("has no in-page back link: the Improve crumb is the return path, with the state", async () => {
        await renderPage();

        expect(
            within(screen.getByRole("main")).queryByRole("link", { name: /Back to/ }),
        ).toBeNull();
        const crumb = within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole(
            "link",
            { name: "Improve" },
        );
        const url = new URL(crumb.getAttribute("href") ?? "", "https://app.example");
        expect(url.pathname).toBe("/improve");
        expect(decodeFilter(url.searchParams.get("f"))).toEqual(FILTERS);
        expect(url.searchParams.get("role")).toBe("em");
    });

    it("renders one scope bar for the opportunities view, above the cards", async () => {
        await renderPage();

        expect(scopeBarSpy).toHaveBeenCalledWith({ view: "opportunities" });
        expect(screen.getAllByTestId("scope-bar")).toHaveLength(1);
        expect(
            screen
                .getByTestId("scope-bar")
                .compareDocumentPosition(screen.getByTestId("opportunities-empty")) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("has no 'Automation opportunities for AI-assisted work' banner: the prototype view has none", async () => {
        await renderPage();

        expect(screen.queryByTestId("improve-ai-automations-crosslink")).toBeNull();
        expect(screen.queryByText(/Automation opportunities for AI-assisted work/)).toBeNull();
    });

    it("has a View evidence action listing the open count and each opportunity's served rationale", async () => {
        getOpportunitiesMock.mockResolvedValue({
            items: [
                {
                    id: "a",
                    title: "Reduce Review Latency",
                    rationale: "Review Latency climbed 258% in the last 90 days.",
                    evidence_links: [],
                    suggested_experiments: [],
                },
                {
                    id: "b",
                    title: "Reduce Cycle Time",
                    rationale: "Cycle Time climbed 655% in the last 90 days.",
                    evidence_links: [],
                    suggested_experiments: [],
                },
            ],
        });
        await renderPage();

        await userEvent.click(
            within(screen.getByTestId("page-header")).getByRole("button", {
                name: "View evidence",
            }),
        );
        const rows = within(await screen.findByTestId("page-evidence-facts"))
            .getAllByTestId("evidence-fact")
            .map((row) => [
                row.querySelector("dt")?.textContent,
                row.querySelector("dd")?.textContent,
            ]);
        expect(rows).toEqual([
            ["Open opportunities", "2"],
            ["Reduce Review Latency", "Review Latency climbed 258% in the last 90 days."],
            ["Reduce Cycle Time", "Cycle Time climbed 655% in the last 90 days."],
        ]);
    });

    it("has no View evidence action when the fetch failed", async () => {
        getOpportunitiesMock.mockRejectedValue(new Error("down"));
        await renderPage();

        expect(screen.queryByRole("button", { name: "View evidence" })).toBeNull();
    });

    it("shows a failed fetch as an error with Retry, not as an empty state", async () => {
        getOpportunitiesMock.mockRejectedValue(new Error("down"));
        await renderPage();

        const box = screen.getByTestId("opportunities-error");
        expect(box).toHaveAttribute("data-variant", "error");
        expect(within(box).getByText("Opportunity data unavailable.")).toBeInTheDocument();
        expect(within(box).getByRole("button", { name: "Retry" })).toBeInTheDocument();
        expect(screen.queryByTestId("opportunities-empty")).toBeNull();
    });

    it("shows no open opportunities as the neutral empty state with the same text", async () => {
        await renderPage();

        const box = screen.getByTestId("opportunities-empty");
        expect(box).not.toHaveAttribute("data-variant", "error");
        expect(box).toHaveTextContent(
            "No open opportunities in this window — nothing is trending worse for the current scope.",
        );
        expect(screen.queryByTestId("opportunities-error")).toBeNull();
    });

    it("shows the list and the selected opportunity when there are items", async () => {
        getOpportunitiesMock.mockResolvedValue({
            items: [
                {
                    id: "opp-1",
                    title: "Reduce Review Latency",
                    rationale: "Review Latency climbed 1041% in the last 14 days.",
                    evidence_links: ["/api/v1/explain?metric=review_latency"],
                    suggested_experiments: ["Trial a review SLA"],
                },
            ],
        });
        await renderPage();

        expect(screen.getByTestId("opportunity-list")).toBeInTheDocument();
        expect(screen.getByTestId("opportunity-detail")).toBeInTheDocument();
    });
});

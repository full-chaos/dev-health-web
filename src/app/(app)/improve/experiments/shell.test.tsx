import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { EvidenceDrawerProvider } from "@/components/evidence/EvidenceDrawerProvider";
import { AppShell } from "@/components/shell/AppShell";
import { getMetricLabel } from "@/lib/metrics/catalog";

import ExperimentsPage from "./page";

// Experiments inside the shared app shell. The Improve crumb in the top bar
// replaces the in-page link back to the Improve overview.

const scopeBarSpy = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
    usePathname: () => "/improve/experiments",
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
vi.mock("@/lib/auth", () => ({
    requireSession: vi.fn().mockResolvedValue({ user: { org_id: "org-1" } }),
}));
const getExperimentsMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/graphql/improveFetchers", () => ({
    getExperimentsViaGraphQL: (...args: unknown[]) => getExperimentsMock(...args),
}));
vi.mock("@/components/evidence/EvidencePanel", () => ({
    EvidencePanel: (props: { isOpen: boolean; metric?: string }) =>
        props.isOpen ? <div data-testid="evidence-drawer">{props.metric}</div> : null,
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
                    {await ExperimentsPage({ searchParams: Promise.resolve({ role: "em" }) })}
                </AppShell>
            </EvidenceDrawerProvider>
        </AdminTierProvider>,
    );
}

const experiment = (id: string, metric: string, hypothesis: string) => ({
    id,
    opportunityId: "opp-1",
    metric,
    hypothesis,
    status: "SUGGESTED",
    owner: "",
    stopCondition: "",
});

beforeEach(() => {
    scopeBarSpy.mockClear();
    getExperimentsMock.mockReset();
    getExperimentsMock.mockResolvedValue({ items: [] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("Experiments in the shared app shell", () => {
    it("has one main, one h1 and the subtitle", async () => {
        await renderPage();

        expect(screen.getAllByRole("main")).toHaveLength(1);
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Experiments");
        expect(screen.getByTestId("page-header-eyebrow")).toHaveTextContent(
            "Improve / Experiments",
        );
        expect(
            within(screen.getByTestId("page-header")).getByText(
                "Process experiments derived from improvement opportunities — each with a hypothesis and a metric.",
            ),
        ).toBeInTheDocument();
    });

    it("has no in-page back link: the Improve crumb is the return path", async () => {
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
        expect(url.searchParams.get("role")).toBe("em");
    });

    it("renders one scope bar with no page filters, above the content: the page had the global context bar alone", async () => {
        await renderPage();

        expect(scopeBarSpy).toHaveBeenCalledWith({ pageFilters: false });
        expect(screen.getAllByTestId("scope-bar")).toHaveLength(1);
        expect(
            screen
                .getByTestId("scope-bar")
                .compareDocumentPosition(screen.getByTestId("experiments-empty")) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    describe("suggestions", () => {
        const two = () =>
            getExperimentsMock.mockResolvedValue({
                items: [
                    experiment("e1", "review_latency", "Trial a 24h review SLA"),
                    experiment("e2", "cycle_time", "Cap WIP at three"),
                ],
            });

        it("says they are suggestions, not active or assigned experiments", async () => {
            two();
            await renderPage();

            const notice = screen.getByTestId("experiments-notice");
            expect(notice).toHaveTextContent("2 suggested experiments.");
            expect(notice).toHaveTextContent("Suggestions are not active or assigned experiments.");
            expect(notice).not.toHaveTextContent(/owner|stop condition/i);
        });

        it("shows a neutral metric tag, Suggestion N, and the hypothesis as the title", async () => {
            two();
            await renderPage();

            const cards = screen.getAllByTestId("experiment-card");
            expect(cards).toHaveLength(2);
            expect(within(cards[0]).getByText("Suggestion 1")).toBeInTheDocument();
            expect(within(cards[1]).getByText("Suggestion 2")).toBeInTheDocument();
            expect(
                within(cards[0]).getByText(getMetricLabel("review_latency")),
            ).toBeInTheDocument();
            expect(within(cards[0]).getByText("Trial a 24h review SLA")).toBeInTheDocument();
            expect(within(cards[0]).queryByText("SUGGESTED")).toBeNull();
        });

        it("hides Owner and Stop condition: no rows and no dash cells", async () => {
            two();
            await renderPage();

            const list = screen.getByTestId("experiments-list");
            expect(within(list).queryByText(/^Owner$/i)).toBeNull();
            expect(within(list).queryByText(/stop condition/i)).toBeNull();
            expect(within(list).queryByText("—")).toBeNull();
        });

        it("opens the shared evidence drawer for the card's metric", async () => {
            two();
            await renderPage();

            expect(screen.queryByTestId("evidence-drawer")).toBeNull();
            const cards = screen.getAllByTestId("experiment-card");
            await userEvent.click(
                within(cards[1]).getByRole("button", { name: "Review evidence" }),
            );
            expect(screen.getByTestId("evidence-drawer")).toHaveTextContent("cycle_time");
        });
    });

    it("shows a failed load as an error with Retry, same text, not as an empty state", async () => {
        getExperimentsMock.mockResolvedValue(null);
        await renderPage();

        const box = screen.getByTestId("experiments-unavailable");
        expect(box).toHaveAttribute("data-variant", "error");
        expect(box).toHaveTextContent("Experiments unavailable");
        expect(box).toHaveTextContent(
            "Could not load experiment suggestions for the current window. Connect a data source or retry.",
        );
        expect(within(box).getByRole("button", { name: "Retry" })).toBeInTheDocument();
        expect(screen.queryByTestId("experiments-empty")).toBeNull();
    });

    it("keeps the neutral empty state for no experiments", async () => {
        await renderPage();

        const box = screen.getByTestId("experiments-empty");
        expect(box).not.toHaveAttribute("data-variant", "error");
        expect(box).toHaveTextContent("No experiments in this window");
    });

    it("has a View evidence action listing the suggestion count and each hypothesis with its metric", async () => {
        getExperimentsMock.mockResolvedValue({
            items: [
                experiment("e1", "review_latency", "Trial a 24h review SLA"),
                experiment("e2", "", "Cap WIP per squad"),
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
            ["Suggested experiments", "2"],
            ["Suggestion 1", `Trial a 24h review SLA (${getMetricLabel("review_latency")})`],
            ["Suggestion 2", "Cap WIP per squad"],
        ]);
    });

    it("has no View evidence action when the experiments could not load", async () => {
        getExperimentsMock.mockResolvedValue(null);
        await renderPage();

        expect(screen.queryByRole("button", { name: "View evidence" })).toBeNull();
    });
});

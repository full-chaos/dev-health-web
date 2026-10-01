import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";
import { encodeFilter } from "@/lib/filters/encode";
import { defaultMetricFilter } from "@/lib/filters/defaults";

import GovernPage from "./page";
import CompoundingRiskPage from "../risk/compounding/page";
import RepoSecurityPage from "../security/repos/[repoId]/page";

// The Govern pages inside the shared app shell: the layout owns the navigation
// and `<main>`; each page brings the shared header (and a scope bar where it
// had a filter bar before).

const nav = vi.hoisted(() => ({ pathname: "/govern" }));
const scopeBarSpy = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
    usePathname: () => nav.pathname,
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
vi.mock("@/components/navigation/AreaOverview", () => ({
    AreaOverview: () => <div data-testid="area-overview" />,
}));
vi.mock("@/components/security/SecurityAlertQueue", () => ({
    SecurityAlertQueue: () => <div data-testid="alert-queue" />,
}));
vi.mock("@/components/risk/CompoundingRiskDashboard", () => ({
    CompoundingRiskDashboard: () => <div data-testid="compounding-risk-dashboard" />,
}));
vi.mock("@/lib/areaSignals", () => ({ getGovernSignals: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/testops/fetchers", () => ({
    fetchTestOpsData: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/auth", () => ({
    requireSession: vi.fn().mockResolvedValue({ user: { org_id: "org-1" } }),
}));
const graphqlFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/graphql/server", () => ({ graphqlFetch: graphqlFetchMock }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/config", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/config")>()),
    getServerEnv: () => ({ DEV_HEALTH_TEST_MODE: "true" }),
}));

function inShell(children: ReactNode) {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell>{children}</AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    scopeBarSpy.mockClear();
    graphqlFetchMock.mockReset().mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("Govern overview in the shared app shell", () => {
    it("has one main, one h1 and no in-page back link", async () => {
        nav.pathname = "/govern";
        inShell(await GovernPage({ searchParams: Promise.resolve({ role: "em" }) }));

        expect(screen.getAllByRole("main")).toHaveLength(1);
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Govern");
        expect(
            within(screen.getByRole("main")).queryByRole("link", { name: /Back to/ }),
        ).toBeNull();
        expect(screen.getAllByTestId("scope-bar")).toHaveLength(1);
        expect(screen.getByTestId("area-overview")).toBeInTheDocument();
    });
});

describe("Compounding Risk in the shared app shell", () => {
    const developerFilter = encodeFilter({
        ...defaultMetricFilter,
        scope: { level: "developer", ids: ["user-x"] },
    });

    it("keeps the person-scope guardrail, with one h1 and the test id on the page wrapper", async () => {
        nav.pathname = "/risk/compounding";
        inShell(
            await CompoundingRiskPage({
                searchParams: Promise.resolve({ f: developerFilter, origin: "cockpit" }),
            }),
        );

        expect(screen.getAllByRole("main")).toHaveLength(1);
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Compounding Risk");
        expect(screen.getByTestId("compounding-risk-page")).toBeInTheDocument();
        const guardrail = screen.getByTestId("developer-scope-guardrail");
        expect(guardrail).toHaveAttribute("data-notice-variant", "warn");
        expect(guardrail).toHaveTextContent(
            "this surface intentionally does not break down by person",
        );
        expect(
            screen.getByRole("heading", { name: "Compounding Risk is a team and repo signal." }),
        ).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Return to team/repo view" })).toHaveAttribute(
            "href",
            "/risk/compounding",
        );
        expect(screen.queryByTestId("compounding-risk-dashboard")).toBeNull();
        expect(scopeBarSpy).toHaveBeenCalledWith({
            view: "risk-compounding",
            origin: "cockpit",
        });
    });

    it("renders the dashboard for a team scope", async () => {
        nav.pathname = "/risk/compounding";
        inShell(await CompoundingRiskPage({ searchParams: Promise.resolve({}) }));

        expect(screen.getByTestId("compounding-risk-dashboard")).toBeInTheDocument();
        expect(screen.queryByTestId("developer-scope-guardrail")).toBeNull();
    });
});

describe("Security repository page in the shared app shell", () => {
    const renderRepoPage = async () =>
        inShell(
            await RepoSecurityPage({
                params: Promise.resolve({ repoId: "test-repo-id" }),
                searchParams: Promise.resolve({}),
            }),
        );

    it("has the repository NAME as the one h1, a way back to Security and the alert queue", async () => {
        nav.pathname = "/security/repos/test-repo-id";
        graphqlFetchMock.mockResolvedValue({
            securityAlerts: {
                edges: [{ node: { repoId: "test-repo-id", repoName: "acme/billing" } }],
            },
        });
        await renderRepoPage();

        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("acme/billing");
        // One alert of that repository, in any state, names it.
        const [, variables] = graphqlFetchMock.mock.calls[0];
        expect(variables).toMatchObject({
            filters: { repoIds: ["test-repo-id"], openOnly: false },
            pagination: { first: 1 },
        });
        expect(screen.getByText("Security alerts scoped to this repository.")).toBeInTheDocument();
        expect(
            within(screen.getByRole("main")).getByRole("link", { name: /Back to Security/ }),
        ).toHaveAttribute("href", "/security");
        expect(screen.getByTestId("alert-queue")).toBeInTheDocument();
    });

    it("falls back to the repository id, never blank, when no alert row carries the name", async () => {
        nav.pathname = "/security/repos/test-repo-id";
        graphqlFetchMock.mockRejectedValue(new Error("no data"));
        await renderRepoPage();

        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("test-repo-id");
    });

    it("has a scope bar with the repository control locked to the route", async () => {
        nav.pathname = "/security/repos/test-repo-id";
        graphqlFetchMock.mockResolvedValue({
            securityAlerts: {
                edges: [{ node: { repoId: "test-repo-id", repoName: "acme/billing" } }],
            },
        });
        await renderRepoPage();

        const bar = screen.getByTestId("scope-bar");
        expect(bar).toHaveAttribute("data-view", "security-repo");
        expect(within(bar).getByRole("button", { name: /Repo/ })).toBeDisabled();
    });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { scopeBarUrl, FILTER_OPTIONS } from "@/test/scopeBarHarness";

import GovernPage from "./page";
import IncidentCorrelationPage from "../incident-correlation/page";

// Govern and Incident Correlation had the global context bar alone: no page
// filter. Their scope bar has no Filters drawer, no scope lock, and writes no
// default `f` on load (production wrote none).

vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: scopeBarUrl.replace, push: vi.fn(), refresh: vi.fn() }),
    usePathname: () => scopeBarUrl.pathname,
    useSearchParams: () => new URLSearchParams(scopeBarUrl.search),
}));
vi.mock("@/components/filters/useFilterOptions", () => ({
    useFilterOptions: () => FILTER_OPTIONS,
}));
vi.mock("@/components/shell/PageHeader", () => ({
    PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/navigation/AreaOverview", () => ({ AreaOverview: () => null }));
vi.mock("@/components/incident-correlation/IncidentCorrelationDashboard", () => ({
    IncidentCorrelationDashboard: () => null,
}));
vi.mock("@/lib/areaSignals", () => ({ getGovernSignals: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/testops/fetchers", () => ({ fetchTestOpsData: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/api/home", () => ({ getExplainData: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/graphql/homeFetchers", () => ({
    getHomeDataViaGraphQL: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/graphql/server", () => ({ graphqlFetch: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/auth", () => ({
    requireSession: vi.fn().mockResolvedValue({ user: { org_id: "org-1" } }),
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/config", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/config")>()),
    getServerEnv: () => ({ DEV_HEALTH_TEST_MODE: "true" }),
}));

beforeEach(() => {
    scopeBarUrl.reset("");
});

describe.each([
    ["Govern overview", () => GovernPage({ searchParams: Promise.resolve({}) })],
    ["Incident Correlation", () => IncidentCorrelationPage({ searchParams: Promise.resolve({}) })],
])("%s scope bar", (_name, load) => {
    it("has no Filters drawer trigger and writes no default `f` on first load", async () => {
        render(await load());

        expect(screen.getByTestId("scope-bar")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();
        // Let the bar's effects run, then check it wrote nothing.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(scopeBarUrl.replace).not.toHaveBeenCalled();
    });
});

/**
 * The /incident-correlation page passes `homeReadFailed` to the dashboard (CHAOS-9189 in the
 * describe name). The real fetchOrNull is used, so a rejected Home fetch becomes null by the real
 * path. The dashboard is replaced by a stub that draws the flag it received.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/utils";

const { getHome } = vi.hoisted(() => ({ getHome: vi.fn() }));

vi.mock("@/lib/logger", () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div data-testid="scope-bar" /> }));
vi.mock("@/components/incident-correlation/IncidentCorrelationDashboard", () => ({
    IncidentCorrelationDashboard: (props: { homeReadFailed?: boolean }) => (
        <div data-testid="dashboard-stub">{`homeReadFailed=${String(props.homeReadFailed)}`}</div>
    ),
}));
vi.mock("@/lib/auth", () => ({
    requireSession: async () => ({ user: { org_id: "org-1" } }),
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: async () => ({ ok: true }) }));
vi.mock("@/lib/api/home", () => ({ getExplainData: async () => null }));
vi.mock("@/lib/graphql/homeFetchers", () => ({ getHomeDataViaGraphQL: getHome }));
vi.mock("@/lib/graphql/server", () => ({
    graphqlFetch: async () => ({ workGraphEdges: { edges: [] } }),
}));

import IncidentCorrelationPage from "./page";

const draw = async () =>
    render(await IncidentCorrelationPage({ searchParams: Promise.resolve({}) }));

describe("/incident-correlation page when the Home read fails (CHAOS-9189)", () => {
    beforeEach(() => {
        getHome.mockReset();
    });

    it("failed read: the dashboard gets homeReadFailed true", async () => {
        getHome.mockRejectedValue(new Error("GraphQL error: [Network] Service Unavailable"));
        await draw();

        expect(screen.getByTestId("dashboard-stub")).toHaveTextContent("homeReadFailed=true");
    });

    it("answer served (empty or normal): the dashboard gets homeReadFailed false", async () => {
        getHome.mockResolvedValue({ deltas: [] });
        await draw();

        expect(screen.getByTestId("dashboard-stub")).toHaveTextContent("homeReadFailed=false");
    });
});

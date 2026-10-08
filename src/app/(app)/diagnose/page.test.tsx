import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AreaSignal } from "@/lib/areaSignals/types";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";

const getDiagnoseSignalsMock = vi.fn();
const areaOverviewSpy = vi.hoisted(() => vi.fn());
const evidencePanelSpy = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
    usePathname: () => "/diagnose",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => null }));
vi.mock("@/components/navigation/AreaOverview", () => ({
    AreaOverview: (props: Record<string, unknown>) => {
        areaOverviewSpy(props);
        return <div data-testid="area-overview" />;
    },
}));
// The request path of the shared drawer: the page test only checks which subject it is opened for.
vi.mock("@/components/evidence/EvidencePanel", () => ({
    EvidencePanel: (props: Record<string, unknown>) => {
        evidencePanelSpy(props);
        return <div data-testid="evidence-panel" />;
    },
}));
vi.mock("@/lib/areaSignals/diagnose", () => ({
    getDiagnoseSignals: (...args: unknown[]) => getDiagnoseSignalsMock(...args),
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/config", () => ({
    getServerEnv: () => ({ DEV_HEALTH_TEST_MODE: "true" }),
}));

import DiagnosePage from "./page";

const signal = (over: Partial<AreaSignal> & Pick<AreaSignal, "id">): AreaSignal => ({
    label: over.id,
    href: `/${over.id}`,
    metricLabel: `${over.id} metric`,
    value: "1",
    state: "low",
    ...over,
});

const CODE = signal({
    id: "code",
    label: "Code",
    metricLabel: "Code churn",
    value: "1,320,441",
    state: "critical",
});
const COMPLEXITY = signal({
    id: "complexity",
    label: "Complexity",
    metricLabel: "Avg complexity",
    value: "121.3",
    state: "high",
});

async function draw(params: Record<string, string> = {}) {
    return render(await DiagnosePage({ searchParams: Promise.resolve(params) }));
}

beforeEach(() => {
    getDiagnoseSignalsMock.mockReset().mockResolvedValue([]);
    areaOverviewSpy.mockClear();
    evidencePanelSpy.mockClear();
});

describe("Diagnose Ask Dev entry point", () => {
    it("does not render a duplicate Ask Dev launcher", async () => {
        await draw({ scope_type: "team", scope_id: "private-team-id", range_days: "30" });

        expect(
            screen.queryByRole("button", { name: "Ask Dev about this" }),
        ).not.toBeInTheDocument();
    });

    it("renders the follow-a-question links after the area overview", async () => {
        await draw({ role: "manager" });
        const section = screen.getByTestId("diagnose-questions");
        expect(section).toBeInTheDocument();
        expect(section.querySelectorAll("a")).toHaveLength(3);
        expect(section.querySelector("a")?.getAttribute("href")).toContain("role=manager");
        expect(
            screen.getByTestId("area-overview").compareDocumentPosition(section) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });
});

describe("Diagnose overview layout (approved prototype diagnoseHub, CHAOS-8065)", () => {
    it("has the prototype subtitle, without 'from one durable area'", async () => {
        await draw();
        const header = within(screen.getByTestId("page-header"));
        expect(
            header.getByText(
                "Investigate flow, investment, landscape, work graph, complexity, cognitive load, bottlenecks, and code.",
            ),
        ).toBeInTheDocument();
        expect(header.queryByText(/durable area/)).toBeNull();
    });

    it("draws no legacy description line above the hero: the overview gets no eyebrow text", async () => {
        getDiagnoseSignalsMock.mockResolvedValue([CODE, COMPLEXITY]);
        await draw();
        const props = areaOverviewSpy.mock.calls[0][0] as Record<string, unknown>;
        expect(props.title).toBeUndefined();
        expect(props.description).toBeUndefined();
        expect(screen.queryByText("Diagnostic sub-areas, ordered by severity.")).toBeNull();
    });

    it("has one 'View evidence' header action", async () => {
        await draw();
        const actions = within(screen.getByTestId("page-header-actions"));
        expect(actions.getAllByRole("button")).toHaveLength(1);
        expect(actions.getByRole("button", { name: "View evidence" })).toBeInTheDocument();
    });

    it("View evidence explains the page: every served signal in body order, no explain metric", async () => {
        getDiagnoseSignalsMock.mockResolvedValue([
            COMPLEXITY,
            signal({
                id: "landscape",
                label: "Landscape",
                metricLabel: "Bus factor",
                value: "",
                state: "unavailable",
            }),
            CODE,
        ]);
        await draw({ role: "em", range_days: "90" });

        fireEvent.click(screen.getByRole("button", { name: "View evidence" }));

        // The page brings its own body: the drawer loads no metric, also when the hero is Code.
        expect(screen.queryByTestId("evidence-panel")).toBeNull();
        expect(evidencePanelSpy).not.toHaveBeenCalled();
        const drawer = within(screen.getByRole("dialog"));
        // The shared page-facts helper (one pattern with Plan and Improve).
        expect(drawer.getByTestId("page-evidence-facts")).toBeInTheDocument();
        expect(drawer.getAllByTestId("evidence-fact").map((row) => row.textContent)).toEqual([
            "Code · Code churn1,320,441 · Critical",
            "Complexity · Avg complexity121.3 · High",
            "Landscape · Bus factorUnknown",
        ]);
    });

    it("View evidence lists the page when no signal has data (never an invented metric)", async () => {
        getDiagnoseSignalsMock.mockResolvedValue([
            signal({ id: "code", label: "Code", value: "", state: "unavailable" }),
        ]);
        await draw();

        fireEvent.click(screen.getByRole("button", { name: "View evidence" }));

        expect(evidencePanelSpy).not.toHaveBeenCalled();
        const row = within(screen.getByRole("dialog")).getByTestId("evidence-fact");
        expect(row).toHaveAttribute("data-reported", "false");
        expect(row).toHaveTextContent("Unknown");
    });
});

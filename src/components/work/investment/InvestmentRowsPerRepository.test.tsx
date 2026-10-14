/**
 * One work unit can come back as several rows under a repository scope (same work_unit_id, one row
 * per repository, effort = that repository's share). Mock data only.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, cleanup, within } from "@/test/utils";
import type { MetricFilter } from "@/lib/filters/types";
import type { WorkUnitInvestment } from "@/lib/types";
import { computeEvidenceBandCounts, workUnitRowKey } from "@/lib/investment";
import type { UseInvestmentDataResult } from "./useInvestmentData";

const { useInvestmentDataMock, evidenceQualityGroupsMock } = vi.hoisted(() => ({
    useInvestmentDataMock: vi.fn(),
    evidenceQualityGroupsMock: vi.fn(),
}));

vi.mock("./useInvestmentData", () => ({
    useInvestmentData: (args: unknown) => useInvestmentDataMock(args),
}));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => undefined, useSsr: () => null }));
vi.mock("urql", () => ({
    useQuery: () => [{ data: undefined, fetching: false, error: undefined }, vi.fn()],
}));
vi.mock("@/lib/graphql/hooks/useInvestment", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useInvestmentEvidenceQualityGroups: (...args: unknown[]) => evidenceQualityGroupsMock(...args),
}));
vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));
vi.mock("./AllocationCoverage", () => ({ AllocationCoverage: () => null }));
vi.mock("./EvidenceQualityBands", () => ({ EvidenceQualityBands: () => null }));

import { InvestmentView } from "../InvestmentView";

const UUID = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";

const repoFilters: MetricFilter = {
    scope: { level: "org", ids: [] },
    time: { range_days: 30, compare_days: 30 },
    who: { developers: [] },
    what: { repos: ["org/api", "org/web"] },
    why: { work_category: [] },
    how: {},
};

const row = (
    id: string,
    effort: number,
    repo: string | null,
    overrides: Partial<WorkUnitInvestment> = {},
): WorkUnitInvestment => ({
    work_unit_id: id,
    work_unit_name: `Unit ${id}`,
    work_unit_type: "pr",
    time_range: { start: "2026-02-01T00:00:00Z", end: "2026-03-01T00:00:00Z" },
    effort: { metric: "active_hours", value: effort },
    investment: { themes: { feature_delivery: 1 }, subcategories: { "feature.build": 1 } },
    evidence_quality: { value: 0.2, band: "low" },
    evidence: {
        textual: [],
        structural: [],
        contextual: repo ? [{ type: "repo_scope", repo_ids: [repo] }] : [],
    },
    ...overrides,
});

// unit "shared" in 2 repositories (4 + 6), unit "solo" in 1 repository (3).
const repoRows = [
    row("shared", 4, "org/api"),
    row("shared", 6, UUID, { evidence_quality: { value: 0.1, band: "very_low" } }),
    row("solo", 3, "org/web", { evidence_quality: { value: 0.8, band: "high" } }),
];
const oneRowPerUnit = [row("shared", 10, null), row("solo", 3, null)];

function makeData(workUnits: WorkUnitInvestment[], selectedId?: string): UseInvestmentDataResult {
    return {
        workUnits,
        isLoading: false,
        investmentMix: null,
        isMixLoading: false,
        mixExplanation: { data: null, filtersKey: "", focus: { theme: null, subcategory: null } },
        focusTheme: null,
        setFocusTheme: vi.fn(),
        focusSubcategory: null,
        setFocusSubcategory: vi.fn(),
        explanation: null,
        isExplaining: false,
        isExplainingMix: false,
        regenerateMixExplanation: vi.fn(),
        selectedCategory: null,
        setSelectedCategory: vi.fn(),
        focusedTeam: null,
        setFocusedTeam: vi.fn(),
        teamCategoryFlow: null,
        baselineSankeyFlow: null,
        isCategoryFlowLoading: false,
        repoTeamFlow: null,
        isRepoTeamLoading: false,
        repoTeamFlowFailed: false,
        filters: repoFilters,
        selectedThemeKey: null,
        showSubcategories: false,
        selectedUnit: selectedId
            ? (workUnits.find((u) => u.work_unit_id === selectedId) ?? null)
            : null,
        selectedUnitTypeLabel: "",
        selectedId: selectedId ?? null,
        mixExplainKey: "",
        handleSelect: vi.fn(),
    } as unknown as UseInvestmentDataResult;
}

afterEach(() => {
    cleanup();
    useInvestmentDataMock.mockReset();
    evidenceQualityGroupsMock.mockReset();
    vi.restoreAllMocks();
});

describe("work unit in several repositories", () => {
    it("row key differs per repository and band counts are by unit", () => {
        expect(workUnitRowKey(repoRows[0])).not.toBe(workUnitRowKey(repoRows[1]));
        const counts = computeEvidenceBandCounts(repoRows);
        expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(2);
        expect(counts.low).toBe(1);
        expect(counts.high).toBe(1);
        expect(counts.very_low).toBe(0);
    });

    it("evidence table: 3 rows, Units = 2, effort = sum of shares, rows open alone, repository by name", () => {
        evidenceQualityGroupsMock.mockReturnValue({ groups: [] });
        useInvestmentDataMock.mockReturnValue(makeData(repoRows));
        const error = vi.spyOn(console, "error").mockImplementation(() => {});

        render(<InvestmentView filters={repoFilters} activeTab="evidence" />);

        const groupRow = screen.getByTestId("evidence-group-row");
        expect(within(groupRow).getByText("2")).toBeInTheDocument();
        expect(groupRow).toHaveTextContent("13 active hours");

        fireEvent.click(screen.getByRole("button", { name: "Evidence: Feature Delivery" }));
        const dialog = within(screen.getByRole("dialog"));
        expect(dialog.getAllByRole("button", { name: /Unit (shared|solo)/ })).toHaveLength(3);
        expect(dialog.getByTestId("evidence-group-facts")).toHaveTextContent(/Units\s*2/);
        const names = dialog.getAllByTestId("evidence-unit-repository").map((n) => n.textContent);
        expect(names).toEqual(["Unresolved", "org/api", "org/web"]);
        expect(screen.getByRole("dialog").textContent).not.toContain(UUID);

        // each row opens alone
        const buttons = dialog.getAllByRole("button", { name: /Unit shared/ });
        fireEvent.click(buttons[0]);
        expect(dialog.getAllByText("Classification rationale")).toHaveLength(1);
        fireEvent.click(buttons[1]);
        expect(dialog.getAllByText("Classification rationale")).toHaveLength(2);
        expect(error.mock.calls.some((call) => String(call[0]).includes("same key"))).toBe(false);
    });

    it("the unit picker lists a unit once and the detail shows the summed effort", () => {
        evidenceQualityGroupsMock.mockReturnValue({ groups: [] });
        useInvestmentDataMock.mockReturnValue(makeData(repoRows, "shared"));

        render(<InvestmentView filters={repoFilters} activeTab="evidence" />);

        const picker = screen.getByLabelText("Work unit") as HTMLSelectElement;
        const options = within(picker)
            .getAllByRole("option")
            .filter((o) => (o as HTMLOptionElement).value);
        expect(options).toHaveLength(2);
        const detail = screen.getByText("Active hours:").parentElement as HTMLElement;
        expect(detail).toHaveTextContent("10");
        expect(screen.getByTestId("selected-unit-repositories")).toHaveTextContent(
            "org/api, Unresolved",
        );
        expect(document.body.textContent).not.toContain(UUID);
    });

    it("the low-confidence list has one place per unit", () => {
        useInvestmentDataMock.mockReturnValue(makeData(repoRows));
        render(<InvestmentView filters={repoFilters} activeTab="confidence" />);
        expect(screen.getAllByTestId("low-confidence-row")).toHaveLength(1);
    });
});

describe("one row per unit (org / team scope)", () => {
    it("is unchanged", () => {
        evidenceQualityGroupsMock.mockReturnValue({ groups: [] });
        useInvestmentDataMock.mockReturnValue(makeData(oneRowPerUnit, "shared"));
        const { unmount } = render(<InvestmentView filters={repoFilters} activeTab="evidence" />);
        const groupRow = screen.getByTestId("evidence-group-row");
        expect(groupRow).toHaveTextContent("13 active hours");
        expect(within(groupRow).getByText("2")).toBeInTheDocument();
        const picker = screen.getByLabelText("Work unit") as HTMLSelectElement;
        expect(
            within(picker)
                .getAllByRole("option")
                .filter((o) => (o as HTMLOptionElement).value),
        ).toHaveLength(2);
        expect(screen.getByText("Active hours:").parentElement).toHaveTextContent("10");
        expect(screen.queryByTestId("selected-unit-repositories")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Evidence: Feature Delivery" }));
        expect(screen.queryAllByTestId("evidence-unit-repository")).toHaveLength(0);
        unmount();
        expect(computeEvidenceBandCounts(oneRowPerUnit).low).toBe(2);
    });
});

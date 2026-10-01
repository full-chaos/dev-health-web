import { describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/utils";
import type { FilterVisibility } from "../filterBarConfig";

import { AdvancedFiltersPanel } from "./AdvancedFiltersPanel";
import { ActiveFilterPills } from "./ActiveFilterPills";
import { WhySection } from "./WhySection";

const base = {
    issueType: [] as string[],
    toList: (value: string) => value.split(","),
    toValue: (value?: string[]) => (value ?? []).join(","),
    updateIssueType: vi.fn(),
    updateWorkCategory: vi.fn(),
    workCategory: [] as string[],
};

describe("WhySection (CHAOS-7744)", () => {
    it("shows Work category and Issue type by default", () => {
        render(<WhySection {...base} />);
        expect(screen.getByText("Work category")).toBeInTheDocument();
        expect(screen.getByText("Issue type")).toBeInTheDocument();
    });

    it("hides Issue type when the view does not read it, and keeps Work category", () => {
        render(<WhySection {...base} showIssueType={false} />);
        expect(screen.getByText("Work category")).toBeInTheDocument();
        expect(screen.queryByText("Issue type")).toBeNull();
    });
});

describe("AdvancedFiltersPanel — Issue type follows the view's visibility", () => {
    const panel = (visibility: FilterVisibility) => (
        <AdvancedFiltersPanel
            artifacts={[]}
            blocked={false}
            developers={[]}
            filters={
                {
                    scope: { level: "org", ids: [] },
                    time: { range_days: 30 },
                    who: {},
                    what: {},
                    why: {},
                    how: {},
                } as never
            }
            flowStage={[]}
            issueType={[]}
            repos={[]}
            roles={[]}
            updateFilters={vi.fn()}
            visibility={visibility}
            workCategory={[]}
        />
    );

    it("an AI view shows the Why section without Issue type", () => {
        render(panel({ workType: true, issueType: false }));
        expect(screen.getByText("Work category")).toBeInTheDocument();
        expect(screen.queryByText("Issue type")).toBeNull();
    });

    it("another view keeps Issue type", () => {
        render(panel({ workType: true }));
        expect(screen.getByText("Issue type")).toBeInTheDocument();
    });
});

describe("ActiveFilterPills — Issue type pill follows the view's visibility (CHAOS-7744)", () => {
    const pills = (showIssueType?: boolean) => (
        <ActiveFilterPills
            artifacts={[]}
            blocked={false}
            developers={[]}
            flowStage={[]}
            issueType={["bug"]}
            onClearArtifact={vi.fn()}
            onClearBlocked={vi.fn()}
            onClearDeveloper={vi.fn()}
            onClearFlowStage={vi.fn()}
            onClearIssueType={vi.fn()}
            onClearRepo={vi.fn()}
            onClearRole={vi.fn()}
            onClearWorkCategory={vi.fn()}
            repos={[]}
            roles={[]}
            showIssueType={showIssueType}
            workCategory={["feature"]}
        />
    );

    it("shows the pill by default", () => {
        render(pills());
        expect(screen.getByText("bug")).toBeInTheDocument();
    });

    it("hides the pill where no query reads the issue type, and keeps the others", () => {
        render(pills(false));
        expect(screen.queryByText("bug")).toBeNull();
        expect(screen.getByText("feature")).toBeInTheDocument();
    });
});

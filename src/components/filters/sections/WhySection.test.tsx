import { describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/utils";
import type { FilterVisibility } from "../filterBarConfig";

import { AdvancedFiltersPanel } from "./AdvancedFiltersPanel";
import { ActiveFilterPills } from "./ActiveFilterPills";
import { WhySection } from "./WhySection";

const base = {
    toList: (value: string) => value.split(","),
    toValue: (value?: string[]) => (value ?? []).join(","),
    updateWorkCategory: vi.fn(),
    workCategory: [] as string[],
};

// CHAOS-7799: no query reads roles, artifacts, issue type, flow stage or blocked, so the drawer
// has no input for them on any view.
const REMOVED_LABELS = ["Roles", "Artifacts", "Issue type", "Flow stage", "Blocked only"];

describe("WhySection", () => {
    it("shows Work category and no Issue type", () => {
        render(<WhySection {...base} />);
        expect(screen.getByText("Work category")).toBeInTheDocument();
        expect(screen.queryByText("Issue type")).toBeNull();
    });

    it("hides Work category when the view does not read it", () => {
        render(<WhySection {...base} showWorkCategory={false} />);
        expect(screen.queryByText("Work category")).toBeNull();
    });
});

describe("AdvancedFiltersPanel — only filters a query reads (CHAOS-7799)", () => {
    const panel = (visibility: FilterVisibility) => (
        <AdvancedFiltersPanel
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
            repos={[]}
            updateFilters={vi.fn()}
            visibility={visibility}
            workCategory={[]}
        />
    );

    it("offers Developers, Repos and Work category and none of the five removed inputs", () => {
        render(panel({ developer: true, repo: true, workType: true }));
        for (const offered of ["Developers", "Repos", "Work category"]) {
            expect(screen.getByText(offered), offered).toBeInTheDocument();
        }
        for (const removed of REMOVED_LABELS) {
            expect(screen.queryByText(removed), removed).toBeNull();
        }
        expect(screen.queryByText("How")).toBeNull();
    });

    it("an AI view shows the Why section and no Developers input", () => {
        render(panel({ developer: true, workType: true, unreadFilters: ["developers"] }));
        expect(screen.getByText("Work category")).toBeInTheDocument();
        expect(screen.queryByText("Developers")).toBeNull();
    });
});

describe("ActiveFilterPills (CHAOS-7744, CHAOS-7799)", () => {
    const pills = (unread?: Array<"developers" | "workCategory">) => (
        <ActiveFilterPills
            developers={["ana@example.com"]}
            developerLabel={(value) => value}
            repoLabel={(value) => value}
            onClearDeveloper={vi.fn()}
            onClearRepo={vi.fn()}
            onClearWorkCategory={vi.fn()}
            repos={["org/api"]}
            unread={unread}
            workCategory={["feature"]}
        />
    );

    it("shows repo, developer and work category pills by default", () => {
        render(pills());
        for (const shown of ["org/api", "ana@example.com", "feature"]) {
            expect(screen.getByText(shown), shown).toBeInTheDocument();
        }
    });

    it("hides every pill of a filter the view does not read, and keeps the others", () => {
        render(pills(["developers"]));
        expect(screen.queryByText("ana@example.com")).toBeNull();
        expect(screen.getByText("org/api")).toBeInTheDocument();
        expect(screen.getByText("feature")).toBeInTheDocument();
    });
});

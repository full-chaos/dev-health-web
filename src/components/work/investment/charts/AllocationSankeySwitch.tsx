import { useState } from "react";

import { ChartTypeToggle } from "@/components/charts/ChartTypeToggle";
import type { SelectedEntity } from "@/lib/allocationSelection";
import { RepoTeamSankeySection, type RepoTeamSankeySectionProps } from "./RepoTeamSankeySection";
import {
    TeamCategorySankeySection,
    type TeamCategorySankeySectionProps,
} from "./TeamCategorySankeySection";

type AllocationView = "team_theme_repo" | "theme_repo_team";

const VIEW_OPTIONS: Array<{ id: AllocationView; label: string }> = [
    { id: "team_theme_repo", label: "Team → Theme → Repo" },
    { id: "theme_repo_team", label: "Theme → Repo → Team" },
];

type AllocationSankeySwitchProps = {
    teamCategory: Omit<TeamCategorySankeySectionProps, "selectedEntity" | "onSelectEntity">;
    repoTeam: Omit<RepoTeamSankeySectionProps, "selectedEntity" | "onSelectEntity">;
};

/**
 * One Sankey at a time. The switch picks which of the two existing allocation datasets is
 * drawn; each section keeps all of its own behavior. The subcategory / repo selection lives
 * here and is cleared when the view changes (it names a node of one dataset). Team and theme
 * selections stay production's drill state, owned by the page.
 */
export function AllocationSankeySwitch({ teamCategory, repoTeam }: AllocationSankeySwitchProps) {
    const [view, setView] = useState<AllocationView>("team_theme_repo");
    const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <ChartTypeToggle
                    options={VIEW_OPTIONS}
                    value={view}
                    onChangeAction={(next) => {
                        setSelectedEntity(null);
                        setView(next);
                    }}
                    ariaLabel="Allocation view"
                />
                <span className="text-xs text-(--ink-muted)">
                    Select a node to filter the chart to it; hover to focus it.
                </span>
            </div>
            {view === "team_theme_repo" ? (
                <TeamCategorySankeySection
                    {...teamCategory}
                    selectedEntity={selectedEntity}
                    onSelectEntity={setSelectedEntity}
                />
            ) : (
                <RepoTeamSankeySection
                    {...repoTeam}
                    selectedEntity={selectedEntity}
                    onSelectEntity={setSelectedEntity}
                />
            )}
        </div>
    );
}

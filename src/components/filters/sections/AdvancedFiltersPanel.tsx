import type { MetricFilter } from "@/lib/filters/types";
import { isFilterRead, type FilterVisibility } from "../filterBarConfig";
import { toEmailList, toList, toValue } from "../filterBarUtils";
import { HowSection } from "./HowSection";
import { WhatSection } from "./WhatSection";
import { WhoSection } from "./WhoSection";
import { WhySection } from "./WhySection";

type AdvancedFiltersPanelProps = {
    artifacts: string[];
    blocked: boolean;
    developers: string[];
    filters: MetricFilter;
    flowStage: string[];
    issueType: string[];
    repos: string[];
    roles: string[];
    /** One column for a narrow container (the scope bar's drawer). Default: two from `md` up. */
    singleColumn?: boolean;
    updateFilters: (nextFilters: MetricFilter) => void;
    visibility: FilterVisibility;
    workCategory: string[];
};

export function AdvancedFiltersPanel({
    artifacts,
    blocked,
    developers,
    filters,
    flowStage,
    issueType,
    repos,
    roles,
    singleColumn = false,
    updateFilters,
    visibility,
    workCategory,
}: AdvancedFiltersPanelProps) {
    const showWho = Boolean(visibility.developer);
    const showWhat = Boolean(visibility.repo);
    const showWhy = Boolean(visibility.workType);
    const showHow = Boolean(visibility.flowStage);

    return (
        <div className={`mt-4 grid gap-3 ${singleColumn ? "" : "md:grid-cols-2"}`.trim()}>
            {showWho && (
                <WhoSection
                    developers={developers}
                    roles={roles}
                    toDeveloperList={toEmailList}
                    toList={toList}
                    toValue={toValue}
                    updateDevelopers={(nextValues) =>
                        updateFilters({
                            ...filters,
                            who: { ...filters.who, developers: nextValues },
                        })
                    }
                    updateRoles={(nextValues) =>
                        updateFilters({
                            ...filters,
                            who: { ...filters.who, roles: nextValues },
                        })
                    }
                />
            )}
            {showWhat && (
                <WhatSection
                    artifacts={artifacts}
                    repos={repos}
                    toList={toList}
                    toValue={toValue}
                    updateArtifacts={(nextValues) =>
                        updateFilters({
                            ...filters,
                            what: {
                                ...filters.what,
                                artifacts: nextValues as MetricFilter["what"]["artifacts"],
                            },
                        })
                    }
                    updateRepos={(nextValues) =>
                        updateFilters({
                            ...filters,
                            what: { ...filters.what, repos: nextValues },
                        })
                    }
                />
            )}
            {showWhy && (
                <WhySection
                    showIssueType={isFilterRead(visibility, "issueType")}
                    issueType={issueType}
                    toList={toList}
                    toValue={toValue}
                    updateIssueType={(nextValues) =>
                        updateFilters({
                            ...filters,
                            why: { ...filters.why, issue_type: nextValues },
                        })
                    }
                    updateWorkCategory={(nextValues) =>
                        updateFilters({
                            ...filters,
                            why: {
                                ...filters.why,
                                // One work type where the queries take one (the AI pages).
                                work_category: visibility.workTypeSingle
                                    ? nextValues.slice(0, 1)
                                    : nextValues,
                            },
                        })
                    }
                    workCategory={workCategory}
                />
            )}
            {showHow && (
                <HowSection
                    blocked={blocked}
                    flowStage={flowStage}
                    toList={toList}
                    toValue={toValue}
                    updateBlocked={(nextValue) =>
                        updateFilters({
                            ...filters,
                            how: { ...filters.how, blocked: nextValue },
                        })
                    }
                    updateFlowStage={(nextValues) =>
                        updateFilters({
                            ...filters,
                            how: { ...filters.how, flow_stage: nextValues },
                        })
                    }
                />
            )}
        </div>
    );
}

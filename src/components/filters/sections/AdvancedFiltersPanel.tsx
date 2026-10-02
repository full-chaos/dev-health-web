import type { MetricFilter } from "@/lib/filters/types";
import { isFilterRead, type FilterVisibility } from "../filterBarConfig";
import { toEmailList, toList, toValue } from "../filterBarUtils";
import { WhatSection } from "./WhatSection";
import { WhoSection } from "./WhoSection";
import { WhySection } from "./WhySection";

type AdvancedFiltersPanelProps = {
    developers: string[];
    filters: MetricFilter;
    repos: string[];
    /** One column for a narrow container (the scope bar's drawer). Default: two from `md` up. */
    singleColumn?: boolean;
    updateFilters: (nextFilters: MetricFilter) => void;
    visibility: FilterVisibility;
    workCategory: string[];
};

export function AdvancedFiltersPanel({
    developers,
    filters,
    repos,
    singleColumn = false,
    updateFilters,
    visibility,
    workCategory,
}: AdvancedFiltersPanelProps) {
    const showWho = Boolean(visibility.developer);
    const showWhat = Boolean(visibility.repo);
    const showWhy = Boolean(visibility.workType);

    return (
        <div className={`mt-4 grid gap-3 ${singleColumn ? "" : "md:grid-cols-2"}`.trim()}>
            {showWho && (
                <WhoSection
                    showDevelopers={isFilterRead(visibility, "developers")}
                    developers={developers}
                    toDeveloperList={toEmailList}
                    toValue={toValue}
                    updateDevelopers={(nextValues) =>
                        updateFilters({
                            ...filters,
                            who: { ...filters.who, developers: nextValues },
                        })
                    }
                />
            )}
            {showWhat && (
                <WhatSection
                    repos={repos}
                    toList={toList}
                    toValue={toValue}
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
                    showWorkCategory={isFilterRead(visibility, "workCategory")}
                    toList={toList}
                    toValue={toValue}
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
        </div>
    );
}

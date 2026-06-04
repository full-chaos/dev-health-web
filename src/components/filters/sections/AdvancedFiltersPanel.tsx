import type { MetricFilter } from "@/lib/filters/types";
import type { FilterVisibility } from "../filterBarConfig";
import { toList, toValue } from "../filterBarUtils";
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
  updateFilters,
  visibility,
  workCategory,
}: AdvancedFiltersPanelProps) {
  const showWho = Boolean(visibility.developer);
  const showWhat = Boolean(visibility.repo);
  const showWhy = Boolean(visibility.workType);
  const showHow = Boolean(visibility.flowStage);

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {showWho && (
        <WhoSection
          developers={developers}
          roles={roles}
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
              why: { ...filters.why, work_category: nextValues },
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

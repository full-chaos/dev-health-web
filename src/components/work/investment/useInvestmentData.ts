"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
    useInvestmentFlow,
    useInvestmentMix,
    useInvestmentRepoTeamFlow,
} from "@/lib/graphql/hooks";
import { explainInvestmentMix, getWorkUnitExplanation, getWorkUnits } from "@/lib/api/investment";
import { formatWorkUnitTypeLabel, getBaselineFilters } from "@/lib/investment";
import { normalizeInvestmentMix } from "@/lib/investmentMix";
import { buildDateRange } from "@/lib/graphql/investmentFetchers";
import { logger } from "@/lib/logger";
import type { MetricFilter } from "@/lib/filters/types";
import type { WorkUnitExplanation, WorkUnitInvestment } from "@/lib/types";
import { TOP_N_REPOS, isNonCountUnit, normalizeThemeKey } from "@/lib/investment";
import { readCoverage } from "./AllocationCoverage";
import type { InvestmentTab, MixExplanationState } from "./types";

type UseInvestmentDataArgs = {
    filters: MetricFilter;
    /** The tab on screen: a GraphQL read runs only for a tab that draws its data (CHAOS-9166). */
    activeTab?: InvestmentTab;
};

/** The GraphQL reads of the Investment view. */
type InvestmentRead = "mix" | "flow" | "baselineFlow" | "repoTeamFlow" | "workUnits" | "explain";

/**
 * The reads each tab draws (consumers: `InvestmentView.tsx` tab branches).
 *  - overview:   mix (`InvestmentMixSection`, `ClassificationTable`); the coverage line of
 *                `ReadWithContextCard` reads `teamCategoryFlow`, with `repoTeamFlow` only as the
 *                fallback for a value the first flow lacks (CHAOS-9255: that read starts later,
 *                see `FALLBACK_READS`). Nothing reads the baseline flow.
 *  - allocation: the three flows (`TeamCategorySankeySection` with its baseline delta,
 *                `RepoTeamSankeySection`, `AllocationCoverage`). No mix.
 *  - evidence:   none of the GraphQL reads; the work units (`InvestmentEvidenceTable`).
 *  - confidence: mix (`evidence_quality_stats`), plus the team-category flow for the coverage
 *                cards (the repository-team flow is the same fallback as on overview).
 *
 * Two REST reads ride beside them (CHAOS-10711: each runs several ClickHouse statements one after
 * another, so a tab that does not draw them must not start them):
 *  - workUnits: the mix section (overview), the low-confidence list (confidence) and the evidence
 *               table. Allocation draws them only to name a subcategory node, so it starts them
 *               once a theme is selected (`showSubcategories`).
 *  - explain:   the mix explanation (`ReadWithContextCard`, `InvestmentExplainer` on overview;
 *               `ConfidencePanel`). No other tab draws it.
 */
export const INVESTMENT_TAB_READS: Record<InvestmentTab, readonly InvestmentRead[]> = {
    overview: ["mix", "flow", "workUnits", "explain"],
    allocation: ["flow", "baselineFlow", "repoTeamFlow"],
    evidence: ["workUnits"],
    confidence: ["mix", "flow", "workUnits", "explain"],
};

const NO_UNITS: WorkUnitInvestment[] = [];

/** Tabs that draw coverage only: the repository-team flow is there a fallback, not a first read. */
const COVERAGE_FALLBACK_TABS: readonly InvestmentTab[] = ["overview", "confidence"];

export function useInvestmentData({ filters, activeTab = "overview" }: UseInvestmentDataArgs) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [fetchedUnits, setFetchedUnits] = useState<{ key: string; units: WorkUnitInvestment[] }>({
        key: "",
        units: [],
    });
    const [isLoading, setIsLoading] = useState(true);

    // A read starts when a tab that draws it is first shown, and stays on for the same filters, so
    // going back to a tab does not ask the backend again.
    const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
    const [started, setStarted] = useState<{ key: string; reads: readonly InvestmentRead[] }>({
        key: filtersKey,
        reads: INVESTMENT_TAB_READS[activeTab],
    });
    const needed = INVESTMENT_TAB_READS[activeTab];
    const known = started.key === filtersKey ? started.reads : [];
    if (started.key !== filtersKey || needed.some((read) => !known.includes(read))) {
        setStarted({ key: filtersKey, reads: Array.from(new Set([...known, ...needed])) });
    }
    // One window for the mix read and its explanation: each sampling the clock itself can differ across midnight.
    const mixDateRange = useMemo(() => buildDateRange(filters), [filters]);
    const runs = (read: InvestmentRead) =>
        needed.includes(read) || (started.key === filtersKey && started.reads.includes(read));
    const explainOn = runs("explain");

    const {
        data: mixData,
        loading: mixLoading,
        error: mixError,
    } = useInvestmentMix({ filters, pause: !runs("mix"), dateRange: mixDateRange });
    const mixUnitClass = mixData?.unit;
    const mixServedNonCount = isNonCountUnit(mixUnitClass);
    useEffect(() => {
        if (mixServedNonCount) {
            logger.debug(
                { unitClass: mixUnitClass },
                "[investment] mix dropped: served unit is not a work-unit count",
            );
        }
    }, [mixServedNonCount, mixUnitClass]);
    const investmentMix = useMemo(
        () => (mixData && !mixServedNonCount ? normalizeInvestmentMix(mixData) : null),
        [mixData, mixServedNonCount],
    );
    const isMixLoading = mixLoading;
    const mixFailed = Boolean(mixError) || mixServedNonCount;

    const [mixExplanation, setMixExplanation] = useState<MixExplanationState>({
        data: null,
        filtersKey: "",
        focus: { theme: null, subcategory: null },
    });
    const [focusTheme, setFocusTheme] = useState<string | null>(null);
    const [focusSubcategory, setFocusSubcategory] = useState<string | null>(null);
    const [explanation, setExplanation] = useState<WorkUnitExplanation | null>(null);
    const [isExplaining, setIsExplaining] = useState(false);
    const [isExplainingMix, setIsExplainingMix] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [focusedTeam, setFocusedTeam] = useState<string | null>(null);
    const showSubcategories = Boolean(selectedCategory);
    const unitsOn = runs("workUnits") || (activeTab === "allocation" && showSubcategories);
    const selectedThemeKey = useMemo(() => normalizeThemeKey(selectedCategory), [selectedCategory]);

    const baselineFilters = useMemo(() => getBaselineFilters(filters), [filters]);

    const {
        data: currentFlow,
        loading: currentFlowLoading,
        error: currentFlowError,
    } = useInvestmentFlow({
        filters,
        flowMode: showSubcategories ? "team_category_subcategory_repo" : "team_category_repo",
        theme: selectedThemeKey,
        topNRepos: TOP_N_REPOS,
        pause: !runs("flow"),
    });

    const { data: baselineFlowData, loading: baselineFlowLoading } = useInvestmentFlow({
        filters: baselineFilters,
        flowMode: showSubcategories ? "team_category_subcategory_repo" : "team_category_repo",
        theme: selectedThemeKey,
        topNRepos: TOP_N_REPOS,
        pause: !runs("baselineFlow"),
    });

    const teamCategoryFlow = currentFlow;
    const baselineSankeyFlow = baselineFlowData;
    const isCategoryFlowLoading = currentFlowLoading || baselineFlowLoading;
    // Only the current flow's failure is a failure state; a failed comparison flow stays
    // null, so the current flow draws without its delta.
    const categoryFlowFailed = Boolean(currentFlowError);

    const {
        data: repoFlowData,
        loading: repoFlowLoading,
        error: repoFlowError,
    } = useInvestmentRepoTeamFlow({ filters, pause: !runs("repoTeamFlow") });

    // Overview and Confidence take coverage from the team-category flow; the repository-team flow
    // fills a value that flow does not give (`combineCoverage`) and starts only then. A failed
    // first flow gives no value, so the fallback starts (the rule before this read was deferred).
    const usesFallback = COVERAGE_FALLBACK_TABS.includes(activeTab) && !runs("repoTeamFlow");
    const firstFlowSettled =
        runs("flow") && !currentFlowLoading && (!!currentFlow || !!currentFlowError);
    if (usesFallback && firstFlowSettled) {
        const coverage = readCoverage(currentFlow);
        const complete =
            coverage.teamCoverage !== null &&
            coverage.repoCoverage !== null &&
            coverage.unassignedShare !== null;
        if (!complete) {
            setStarted((current) => ({
                key: current.key,
                reads: Array.from(new Set([...current.reads, "repoTeamFlow" as const])),
            }));
        }
    }

    const repoTeamFlow = repoFlowData;
    const isRepoTeamLoading = repoFlowLoading;
    // The coverage numbers of Overview and Confidence wait for the fallback read while it can
    // still change them: the first flow is settled and incomplete, and the fallback has not
    // answered. Settled values never flip (no "none detected" before the fallback answers).
    const fallbackPending =
        COVERAGE_FALLBACK_TABS.includes(activeTab) &&
        runs("repoTeamFlow") &&
        !repoFlowData &&
        !repoFlowError;
    const isCoverageLoading = isCategoryFlowLoading || fallbackPending;
    const repoTeamFlowFailed = Boolean(repoFlowError);

    const includeTextual = true;
    // Every input of the units read: units of other inputs are never served.
    const unitsKey = `${filtersKey}|${includeTextual}|${mixDateRange.startDate}|${mixDateRange.endDate}`;
    const selectedId = searchParams.get("work_unit_id");

    useEffect(() => {
        if (!focusTheme) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing subcategory keeps it consistent with theme focus.
            setFocusSubcategory(null);
        }
    }, [focusTheme]);

    const mixExplainKey = useMemo(
        () => JSON.stringify({ filters, dateRange: mixDateRange }),
        [filters, mixDateRange],
    );

    const regenerateMixExplanation = useCallback(async () => {
        setIsExplainingMix(true);
        try {
            const payload = await explainInvestmentMix({
                filters,
                theme: focusTheme,
                subcategory: focusSubcategory,
                dateRange: mixDateRange,
            });
            setMixExplanation({
                data: payload,
                filtersKey: mixExplainKey,
                focus: { theme: focusTheme, subcategory: focusSubcategory },
            });
        } catch {
            setMixExplanation((current) => ({
                ...current,
                data: null,
                filtersKey: mixExplainKey,
                focus: { theme: focusTheme, subcategory: focusSubcategory },
            }));
        } finally {
            setIsExplainingMix(false);
        }
    }, [filters, focusSubcategory, focusTheme, mixDateRange, mixExplainKey]);

    useEffect(() => {
        let active = true;
        const fetchExplanation = async () => {
            try {
                const payload = await explainInvestmentMix({
                    filters,
                    theme: null,
                    subcategory: null,
                    dateRange: mixDateRange,
                });
                if (active) {
                    setMixExplanation({
                        data: payload,
                        filtersKey: mixExplainKey,
                        focus: { theme: null, subcategory: null },
                    });
                }
            } catch {
                if (active) {
                    setMixExplanation({
                        data: null,
                        filtersKey: mixExplainKey,
                        focus: { theme: null, subcategory: null },
                    });
                }
            }
        };

        if (!explainOn || mixExplanation.filtersKey === mixExplainKey) {
            return;
        }

        fetchExplanation();
        return () => {
            active = false;
        };
    }, [explainOn, filters, mixDateRange, mixExplainKey, mixExplanation.filtersKey]);

    useEffect(() => {
        if (!unitsOn) return;
        let active = true;
        const fetchUnits = async () => {
            setIsLoading(true);
            try {
                const data = await getWorkUnits({
                    filters,
                    include_textual: includeTextual,
                    limit: 200,
                    dateRange: mixDateRange,
                });
                if (active) {
                    setFetchedUnits({ key: unitsKey, units: Array.isArray(data) ? data : [] });
                }
            } catch {
                if (active) {
                    setFetchedUnits({ key: unitsKey, units: [] });
                }
            } finally {
                if (active) {
                    setIsLoading(false);
                }
            }
        };

        fetchUnits();
        return () => {
            active = false;
        };
    }, [unitsOn, filters, includeTextual, mixDateRange, unitsKey]);

    // Units of earlier filters are never served: a gated tab would start an explanation from the
    // selected unit, and the next tab to draw them would show them while it loads.
    const workUnits = useMemo(
        () => (fetchedUnits.key === unitsKey ? fetchedUnits.units : NO_UNITS),
        [fetchedUnits, unitsKey],
    );

    const selectedUnit = useMemo(() => {
        if (!selectedId) return null;
        return workUnits.find((unit) => unit.work_unit_id === selectedId) ?? null;
    }, [selectedId, workUnits]);

    const selectedUnitTypeLabel = useMemo(() => {
        if (!selectedUnit) return "";
        return formatWorkUnitTypeLabel(selectedUnit);
    }, [selectedUnit]);

    useEffect(() => {
        if (!selectedId || !selectedUnit) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale explanation keeps selection state consistent.
            setExplanation(null);
            return;
        }

        let active = true;
        const fetchExplanation = async () => {
            setIsExplaining(true);
            try {
                const data = await getWorkUnitExplanation({
                    workUnitId: selectedId,
                    filters,
                    dateRange: mixDateRange,
                });
                if (active) {
                    setExplanation(data);
                }
            } catch {
                if (active) {
                    setExplanation(null);
                }
            } finally {
                if (active) {
                    setIsExplaining(false);
                }
            }
        };

        fetchExplanation();
        return () => {
            active = false;
        };
    }, [selectedId, selectedUnit, filters, mixDateRange]);

    const handleSelect = useCallback(
        (workUnitId: string) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("work_unit_id", workUnitId);
            router.replace(`${pathname}?${params.toString()}`);
        },
        [pathname, router, searchParams],
    );

    return {
        mixDateRange,
        workUnits,
        isLoading,
        investmentMix,
        isMixLoading,
        mixFailed,
        mixExplanation,
        focusTheme,
        setFocusTheme,
        focusSubcategory,
        setFocusSubcategory,
        explanation,
        isExplaining,
        isExplainingMix,
        regenerateMixExplanation,
        selectedCategory,
        setSelectedCategory,
        focusedTeam,
        setFocusedTeam,
        teamCategoryFlow,
        baselineSankeyFlow,
        isCategoryFlowLoading,
        isCoverageLoading,
        categoryFlowFailed,
        repoTeamFlow,
        isRepoTeamLoading,
        repoTeamFlowFailed,
        filters,
        selectedThemeKey,
        showSubcategories,
        selectedUnit,
        selectedUnitTypeLabel,
        selectedId,
        mixExplainKey,
        handleSelect,
    };
}

export type UseInvestmentDataResult = ReturnType<typeof useInvestmentData>;

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useInvestmentFlow, useInvestmentMix, useInvestmentRepoTeamFlow } from "@/lib/graphql/hooks";
import { explainInvestmentMix, getWorkUnitExplanation, getWorkUnits } from "@/lib/api/investment";
import { formatWorkUnitTypeLabel, getBaselineFilters } from "@/lib/investment";
import { normalizeInvestmentMix } from "@/lib/investmentMix";
import type { MetricFilter } from "@/lib/filters/types";
import type { WorkUnitExplanation, WorkUnitInvestment } from "@/lib/types";
import { TOP_N_REPOS, normalizeThemeKey } from "@/lib/investment";
import type { CategorizationMode, MixExplanationState } from "./types";

type UseInvestmentDataArgs = {
  filters: MetricFilter;
};

export function useInvestmentData({ filters }: UseInvestmentDataArgs) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [categorizationMode, setCategorizationMode] = useState<CategorizationMode>("text_metadata");
  const [workUnits, setWorkUnits] = useState<WorkUnitInvestment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const { data: mixData, loading: mixLoading } = useInvestmentMix({ filters });
  const investmentMix = useMemo(() => (mixData ? normalizeInvestmentMix(mixData) : null), [mixData]);
  const isMixLoading = mixLoading;

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
  const selectedThemeKey = useMemo(() => normalizeThemeKey(selectedCategory), [selectedCategory]);

  const baselineFilters = useMemo(() => getBaselineFilters(filters), [filters]);

  const { data: currentFlow, loading: currentFlowLoading } = useInvestmentFlow({
    filters,
    flowMode: showSubcategories ? "team_category_subcategory_repo" : "team_category_repo",
    theme: selectedThemeKey,
    topNRepos: TOP_N_REPOS,
  });

  const { data: baselineFlowData, loading: baselineFlowLoading } = useInvestmentFlow({
    filters: baselineFilters,
    flowMode: showSubcategories ? "team_category_subcategory_repo" : "team_category_repo",
    theme: selectedThemeKey,
    topNRepos: TOP_N_REPOS,
  });

  const teamCategoryFlow = currentFlow;
  const baselineSankeyFlow = baselineFlowData;
  const isCategoryFlowLoading = currentFlowLoading || baselineFlowLoading;

  const {
    data: repoFlowData,
    loading: repoFlowLoading,
    error: repoFlowError,
  } = useInvestmentRepoTeamFlow({ filters });

  const repoTeamFlow = repoFlowData;
  const isRepoTeamLoading = repoFlowLoading;
  const repoTeamFlowFailed = Boolean(repoFlowError);

  const includeTextual = categorizationMode === "text_metadata";
  const selectedId = searchParams.get("work_unit_id");

  useEffect(() => {
    if (!focusTheme) {
      setFocusSubcategory(null);
    }
  }, [focusTheme]);

  const mixExplainKey = useMemo(() => JSON.stringify({ filters }), [filters]);

  const regenerateMixExplanation = useCallback(async () => {
    setIsExplainingMix(true);
    try {
      const payload = await explainInvestmentMix({
        filters,
        theme: focusTheme,
        subcategory: focusSubcategory,
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
  }, [filters, focusSubcategory, focusTheme, mixExplainKey]);

  useEffect(() => {
    let active = true;
    const fetchExplanation = async () => {
      try {
        const payload = await explainInvestmentMix({
          filters,
          theme: null,
          subcategory: null,
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

    if (mixExplanation.filtersKey === mixExplainKey) {
      return;
    }

    fetchExplanation();
    return () => {
      active = false;
    };
  }, [filters, mixExplainKey, mixExplanation.filtersKey]);

  useEffect(() => {
    let active = true;
    const fetchUnits = async () => {
      setIsLoading(true);
      try {
        const data = await getWorkUnits({
          filters,
          include_textual: includeTextual,
          limit: 200,
        });
        if (active) {
          setWorkUnits(Array.isArray(data) ? data : []);
        }
      } catch {
        if (active) {
          setWorkUnits([]);
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
  }, [filters, includeTextual]);

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
  }, [selectedId, selectedUnit, filters]);

  const handleSelect = useCallback(
    (workUnitId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("work_unit_id", workUnitId);
      router.replace(`/work?${params.toString()}`);
    },
    [router, searchParams]
  );

  return {
    categorizationMode,
    setCategorizationMode,
    workUnits,
    isLoading,
    investmentMix,
    isMixLoading,
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

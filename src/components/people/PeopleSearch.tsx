"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { MetricFilter } from "@/lib/filters/types";
import { withFilterParam } from "@/lib/filters/url";
import type { PeopleSearchResult } from "@/lib/types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";
const EMPTY_LIST: string[] = [];
const EMPTY_RESULTS: PeopleSearchResult[] = [];

type PeopleSearchProps = {
  query?: string;
  filters?: MetricFilter;
};

type PeopleSearchPlan = {
  query?: string;
  teamId?: string;
};

const matchesDeveloper = (
  person: PeopleSearchResult,
  selectedDevelopers: string[]
) => {
  if (!selectedDevelopers.length) {
    return true;
  }
  const targets = selectedDevelopers.map((dev) => dev.toLowerCase());
  const candidates = [
    person.display_name,
    ...(person.identities ?? []).map((identity) => identity.handle),
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return targets.some((target) =>
    candidates.some((candidate) => candidate.includes(target))
  );
};

const matchesTeam = (
  person: PeopleSearchResult,
  teamIds: string[]
) => {
  if (!teamIds.length) {
    return true;
  }
  const teamId = person.team_id;
  if (!teamId) {
    return false;
  }
  return teamIds.includes(teamId);
};

export function PeopleSearch({ query, filters }: PeopleSearchProps) {
  const [results, setResults] = useState<PeopleSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedQuery = useMemo(() => (query ?? "").trim(), [query]);
  const selectedDevelopers = filters?.who?.developers ?? EMPTY_LIST;
  const scopeLevel = filters?.scope?.level;
  const scopeIds = filters?.scope?.ids ?? EMPTY_LIST;
  const teamIds = scopeLevel === "team" ? scopeIds : EMPTY_LIST;
  const hasTeamFilter = teamIds.length > 0;
  const queryActive = trimmedQuery.length > 0;
  const focusActive = selectedDevelopers.length > 0;
  const canFallbackQuery =
    !hasTeamFilter && !queryActive && selectedDevelopers.length === 1;
  const searchTerm = queryActive
    ? trimmedQuery
    : canFallbackQuery
      ? selectedDevelopers[0]
      : "";
  const fetchPlans = useMemo<PeopleSearchPlan[]>(() => {
    if (teamIds.length) {
      return teamIds.map((teamId) => ({
        teamId,
        query: searchTerm || undefined,
      }));
    }
    if (searchTerm) {
      return [{ query: searchTerm }];
    }
    if (focusActive) {
      return selectedDevelopers.map((developer) => ({ query: developer }));
    }
    return [];
  }, [focusActive, searchTerm, selectedDevelopers, teamIds]);
  const shouldFetch = fetchPlans.length > 0;
  const baseResults = useMemo(
    () => (shouldFetch ? results : EMPTY_RESULTS),
    [results, shouldFetch]
  );
  const hasTeamData = useMemo(
    () => baseResults.some((person) => Boolean(person.team_id)),
    [baseResults]
  );
  const visibleResults = useMemo(() => {
    if (!teamIds.length || !hasTeamData) {
      return baseResults;
    }
    return baseResults.filter((person) => matchesTeam(person, teamIds));
  }, [baseResults, teamIds, hasTeamData]);
  const focusMatches = useMemo(
    () =>
      new Set(
        visibleResults
          .filter((person) => matchesDeveloper(person, selectedDevelopers))
          .map((person) => person.person_id)
      ),
    [visibleResults, selectedDevelopers]
  );
  const hasFocusMatches = focusMatches.size > 0;
  const displayResults = useMemo(() => {
    if (focusActive) {
      if (!hasFocusMatches) {
        return EMPTY_RESULTS;
      }
      return visibleResults.filter((person) => focusMatches.has(person.person_id));
    }
    return visibleResults;
  }, [focusActive, focusMatches, hasFocusMatches, visibleResults]);
  const emptyPrompt = hasTeamFilter
    ? "Team filter applied. Search by name/handle to refine results."
    : "Select a team or search by name/handle to find someone.";
  const showEmptyResults =
    shouldFetch && !isLoading && !error && visibleResults.length === 0;
  const showQueryEmpty = showEmptyResults && queryActive;
  const showTeamEmpty = showEmptyResults && !queryActive && hasTeamFilter;
  const showFocusEmpty =
    showEmptyResults && !queryActive && !hasTeamFilter && focusActive;

  useEffect(() => {
    if (!shouldFetch) {
      return;
    }
    const controller = new AbortController();

    const timer = setTimeout(() => {
      setIsLoading(true);
      setError(null);
      const requests = fetchPlans.map((plan) => {
        const url = new URL("/api/v1/people", API_BASE);
        if (plan.query) {
          url.searchParams.set("q", plan.query);
        }
        url.searchParams.set("limit", "20");
        if (plan.teamId) {
          url.searchParams.set("scope_type", "team");
          url.searchParams.set("scope_id", plan.teamId);
          url.searchParams.set("team_id", plan.teamId);
        }
        return fetch(url.toString(), { signal: controller.signal }).then(
          (response) => {
            if (!response.ok) {
              throw new Error("API error");
            }
            return response.json();
          }
        );
      });

      Promise.allSettled(requests)
        .then((payloads) => {
          if (controller.signal.aborted) {
            return;
          }
          const fulfilled = payloads.filter(
            (result): result is PromiseFulfilledResult<PeopleSearchResult[]> =>
              result.status === "fulfilled"
          );
          if (!fulfilled.length) {
            setError("Unable to load people right now.");
            setIsLoading(false);
            return;
          }
          const merged = new Map<string, PeopleSearchResult>();
          fulfilled.forEach((result) => {
            (result.value ?? []).forEach((person) => {
              if (person && typeof person.person_id === "string") {
                merged.set(person.person_id, person);
              }
            });
          });
          setResults(Array.from(merged.values()));
          setIsLoading(false);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setError("Unable to load people right now.");
            setIsLoading(false);
          }
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [fetchPlans, shouldFetch]);

  return (
    <section className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-(--ink-muted)">
            People search
          </p>
          <p className="mt-2 text-sm text-(--ink-muted)">
            Find an individual to view their personal metrics and evidence.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {shouldFetch && isLoading && (
          <div className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-4 py-3 text-sm text-(--ink-muted)">
            Searching people...
          </div>
        )}
        {shouldFetch && error && (
          <div className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-4 py-3 text-sm text-(--ink-muted)">
            {error}
          </div>
        )}
        {showQueryEmpty && (
          <div className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-4 py-3 text-sm text-(--ink-muted)">
            No matches yet. Try another spelling or handle.
          </div>
        )}
        {showTeamEmpty && (
          <div className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-4 py-3 text-sm text-(--ink-muted)">
            No matches for the selected team filter.
          </div>
        )}
        {showFocusEmpty && (
          <div className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-4 py-3 text-sm text-(--ink-muted)">
            No matches for the selected people filter.
          </div>
        )}
        {shouldFetch &&
          !isLoading &&
          !error &&
          visibleResults.length > 0 &&
          focusActive &&
          !hasFocusMatches && (
            <div className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-4 py-3 text-sm text-(--ink-muted)">
              No matches for the selected people filter.
            </div>
          )}
        {!shouldFetch && !focusActive && (
          <div className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-4 py-3 text-sm text-(--ink-muted)">
            {emptyPrompt}
          </div>
        )}
        {displayResults.map((person) => {
          const isFocus = !focusActive || focusMatches.has(person.person_id);
          const href = filters
            ? withFilterParam(`/people/${person.person_id}`, filters)
            : `/people/${person.person_id}`;
          return (
            <Link
              key={person.person_id}
              href={href}
              className={`block rounded-2xl border border-(--card-stroke) bg-card px-4 py-3 transition hover:-translate-y-1 ${focusActive && !isFocus ? "opacity-50" : "opacity-100"
                }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p
                    className={`text-sm font-semibold ${focusActive && !isFocus
                        ? "text-(--ink-muted)"
                        : "text-foreground"
                      }`}
                  >
                    {person.display_name}
                  </p>
                  {isFocus && (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-(--ink-muted)">
                      {(person.identities ?? []).map((identity) => (
                        <span
                          key={`${person.person_id}-${identity.provider}-${identity.handle}`}
                          className="rounded-full border border-(--card-stroke) bg-(--card-70) px-3 py-1"
                        >
                          {identity.provider}: {identity.handle}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-xs uppercase tracking-[0.2em] text-(--accent-2)">
                  Open
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

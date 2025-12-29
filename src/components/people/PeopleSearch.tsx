"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { MetricFilter } from "@/lib/filters/types";
import { withFilterParam } from "@/lib/filters/url";
import type { PeopleSearchResult } from "@/lib/types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";
const EMPTY_LIST: string[] = [];

type PeopleSearchProps = {
  query?: string;
  filters?: MetricFilter;
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
    return true;
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
  const searchTerm = useMemo(() => {
    if (trimmedQuery) {
      return trimmedQuery;
    }
    if (selectedDevelopers.length) {
      return selectedDevelopers[0];
    }
    return "";
  }, [trimmedQuery, selectedDevelopers]);
  const teamIds = scopeLevel === "team" ? scopeIds : EMPTY_LIST;
  const focusActive = selectedDevelopers.length > 0;
  const searchActive = searchTerm.length > 0;
  const baseResults = useMemo(
    () => (searchActive ? results : EMPTY_LIST),
    [results, searchActive]
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
  const emptyPrompt = teamIds.length
    ? "Team filter applied. Search by name/handle to find someone."
    : "Use the team filter or search by name/handle to find someone.";

  useEffect(() => {
    if (!searchTerm) {
      return;
    }
    const controller = new AbortController();

    const timer = setTimeout(() => {
      setIsLoading(true);
      setError(null);
      const url = new URL("/api/v1/people", API_BASE);
      url.searchParams.set("q", searchTerm);
      url.searchParams.set("limit", "20");
      if (teamIds.length) {
        url.searchParams.set("scope_type", "team");
        url.searchParams.set("scope_id", teamIds[0]);
      }

      fetch(url.toString(), { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((payload) => {
          setResults((payload ?? []) as PeopleSearchResult[]);
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
  }, [searchTerm, teamIds]);

  return (
    <section className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
            People search
          </p>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            Find an individual to view their personal metrics and evidence.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {searchActive && isLoading && (
          <div className="rounded-2xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-70)] px-4 py-3 text-sm text-[var(--ink-muted)]">
            Searching people...
          </div>
        )}
        {searchActive && error && (
          <div className="rounded-2xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-70)] px-4 py-3 text-sm text-[var(--ink-muted)]">
            {error}
          </div>
        )}
        {searchActive &&
          !isLoading &&
          !error &&
          trimmedQuery &&
          visibleResults.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-70)] px-4 py-3 text-sm text-[var(--ink-muted)]">
            No matches yet. Try another spelling or handle.
          </div>
        )}
        {searchActive &&
          !isLoading &&
          !error &&
          trimmedQuery &&
          visibleResults.length > 0 &&
          focusActive &&
          !hasFocusMatches && (
            <div className="rounded-2xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-70)] px-4 py-3 text-sm text-[var(--ink-muted)]">
              No matches for the selected people filter.
            </div>
          )}
        {searchActive &&
          !isLoading &&
          !error &&
          !trimmedQuery &&
          focusActive &&
          visibleResults.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-70)] px-4 py-3 text-sm text-[var(--ink-muted)]">
              No matches for the selected people filter.
            </div>
          )}
        {!searchActive && !focusActive && (
          <div className="rounded-2xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-70)] px-4 py-3 text-sm text-[var(--ink-muted)]">
            {emptyPrompt}
          </div>
        )}
        {visibleResults.map((person) => {
          const isFocus = !focusActive || focusMatches.has(person.person_id);
          const href = filters
            ? withFilterParam(`/people/${person.person_id}`, filters)
            : `/people/${person.person_id}`;
          return (
            <Link
              key={person.person_id}
              href={href}
              className={`block rounded-2xl border border-[var(--card-stroke)] bg-[var(--card)] px-4 py-3 transition hover:-translate-y-1 ${
                focusActive && !isFocus ? "opacity-50" : "opacity-100"
              }`}
            >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p
                  className={`text-sm font-semibold ${
                    focusActive && !isFocus
                      ? "text-[var(--ink-muted)]"
                      : "text-[var(--foreground)]"
                  }`}
                >
                  {person.display_name}
                </p>
                {isFocus && (
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--ink-muted)]">
                    {(person.identities ?? []).map((identity) => (
                      <span
                        key={`${person.person_id}-${identity.provider}-${identity.handle}`}
                        className="rounded-full border border-[var(--card-stroke)] bg-[var(--card-70)] px-3 py-1"
                      >
                        {identity.provider}: {identity.handle}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]">
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

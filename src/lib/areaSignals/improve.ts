// ── Improve area signal resolver (CHAOS-2074) ─────────────────────────────────
//
// Resolves the Improve landing's sub-area signal cards. Mirrors govern.ts:
// parallel fetch → AreaSignal[]; server-side orgId-from-session. Improve is
// FLAT (no clusters) and LIGHT (two cards), degrading gracefully per rule R3.
//
// Sub-areas:
//   - Capacity Planning (/capacity-planning) — GraphQL throughputForecast.
//       headline: p50Weeks formatted (e.g. "6 weeks").
//       state: RETURNED from primaryRisk.active (true → "medium"; false → "low").
//       unavailable when insufficientHistory === true.
//
//   - AI Workflows (/ai) — GraphQL aiImpactSummary.
//       headline: aiAssistedPrRatio as %.
//       state: "neutral" always (adoption metric, NOT a severity).
//       unavailable when dataAvailable === false.
//
// Honest-state contract: a source that fails or lacks data degrades to
// state "unavailable" with an empty value — never a fabricated number.

import { auth } from "@/lib/auth";
import { graphqlFetch } from "@/lib/graphql/server";
import { THROUGHPUT_FORECAST_QUERY, AI_IMPACT_SUMMARY_QUERY } from "@/lib/graphql/queries";
import type { ThroughputForecast } from "@/lib/graphql/__generated__/types";
import type { AiImpactSummary, AiDateRangeInput } from "@/lib/graphql/__generated__/types";
import { getAreaById, type NavAreaHubItem } from "@/lib/navigation/areas";
import type { MetricFilter } from "@/lib/filters/types";
import { formatPercent } from "@/lib/formatters";
import { logger } from "@/lib/logger";

import type { AreaSignal, AreaSignalState } from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build an `AreaSignal` from its nav descriptor + resolved state/value. Pulls
 * label / href / cluster / demoted from the descriptor so the card metadata
 * stays anchored to the single nav source of truth.
 */
function buildSignal(
  descriptor: NavAreaHubItem,
  resolved: { state: AreaSignalState; value: string },
): AreaSignal {
  return {
    id: descriptor.id,
    label: descriptor.label,
    href: descriptor.href,
    cluster: descriptor.cluster,
    metricLabel: descriptor.metricLabel ?? descriptor.label,
    value: resolved.value,
    state: resolved.state,
    demoted: descriptor.demoted,
  };
}

/** The unavailable (honest-empty) resolution — no fabricated value. */
const UNAVAILABLE = { state: "unavailable" as const, value: "" };

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Resolve the Improve area's signal cards.
 *
 * @param filters  Active metric filter (drives the analytics date range).
 * @param isTestMode  Render deterministic sample data without hitting the API.
 */
export async function getImproveSignals(
  filters: MetricFilter,
  isTestMode = false,
): Promise<AreaSignal[]> {
  const improve = getAreaById("improve");
  if (!improve) return [];

  // Descriptor lookup by id — card metadata is owned by `navAreas`.
  const byId = new Map(improve.hubItems.map((item) => [item.id, item]));
  const descriptor = (id: string): NavAreaHubItem | undefined => byId.get(id);

  // Resolve the org scope server-side (mirrors govern.ts).
  const orgId = isTestMode ? "default-org" : await resolveOrgId();

  // Date range for AI query (mirrors how govern.ts computes analytics date range).
  const rangeDays = filters.time?.range_days ?? 14;
  const today = new Date();
  const endDate = filters.time?.end_date ?? today.toISOString().slice(0, 10);
  const startDate =
    filters.time?.start_date ??
    new Date(today.getTime() - rangeDays * 86_400_000).toISOString().slice(0, 10);
  const dateRange: AiDateRangeInput = { startDate, endDate };

  // ── Fetch every source in parallel (no serial N+1) ──────────────────────────
  const [throughput, aiImpact] = await Promise.all([
    safe(
      () =>
        isTestMode
          ? Promise.resolve(undefined)
          : graphqlFetch<{ throughputForecast: ThroughputForecast | null }>(
              THROUGHPUT_FORECAST_QUERY,
              { orgId, input: {} },
              { orgId },
            ).then((r) => r.throughputForecast ?? undefined),
      "throughput-forecast",
    ),
    safe(
      () =>
        isTestMode
          ? Promise.resolve(undefined)
          : graphqlFetch<{ aiImpactSummary: AiImpactSummary }>(
              AI_IMPACT_SUMMARY_QUERY,
              { orgId, dateRange, scope: null },
              { orgId },
            ).then((r) => r.aiImpactSummary),
      "ai-impact-summary",
    ),
  ]);

  const signals: AreaSignal[] = [];
  const push = (id: string, resolved: { state: AreaSignalState; value: string }) => {
    const d = descriptor(id);
    if (d) signals.push(buildSignal(d, resolved));
  };

  // ── Capacity Planning ────────────────────────────────────────────────────────
  //
  // State RETURNED from primaryRisk.active (true → watch/"medium"; false → "low").
  // Unavailable when insufficientHistory === true (no data to forecast from).
  if (throughput == null || throughput.insufficientHistory) {
    push("capacity-planning", UNAVAILABLE);
  } else {
    const p50Weeks = throughput.p50Weeks;
    const state: AreaSignalState = throughput.primaryRisk?.active ? "medium" : "low";
    const value = p50Weeks != null ? `${p50Weeks}w` : "";
    push("capacity-planning", { state, value });
  }

  // ── AI Workflows ─────────────────────────────────────────────────────────────
  //
  // State is always "neutral" — adoption %, NOT a severity.
  // Unavailable when dataAvailable === false.
  if (aiImpact == null || !aiImpact.dataAvailable) {
    push("ai-workflows", UNAVAILABLE);
  } else {
    const ratio = aiImpact.aiAssistedPrRatio;
    const value = ratio != null ? formatPercent(ratio * 100) : "";
    push("ai-workflows", { state: "neutral", value });
  }

  return signals;
}

/** Resolve the org scope from the auth session (mirrors govern.ts). */
async function resolveOrgId(): Promise<string> {
  const session = await auth();
  return (session?.user?.org_id as string | undefined) ?? "default-org";
}

/**
 * Run a source fetch, swallowing failures to `undefined` so one dead source
 * degrades to a single honest-empty card instead of failing the whole area.
 */
async function safe<T>(fn: () => Promise<T>, source: string): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    logger.error({ err: error, source }, "Improve signal source failed");
    return undefined;
  }
}

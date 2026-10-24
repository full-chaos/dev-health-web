/**
 * Typed emitters for the product events no surface sent before (CHAOS-8971).
 * One function per event. All are fire-and-forget: they never throw into the page and
 * never await. Bodies are the `TelemetryPayloadByName` shapes the ops intake validates
 * (`POST /api/v1/product-telemetry/events`); ids and counts only, no identity, free text or URL.
 */
import { trackTelemetryEvent } from "@/lib/telemetry";
import { routePatternForPathname } from "@/lib/telemetry/routePatterns";
import type { MetricFilter } from "@/lib/filters/types";
import { ERROR_CLASSES } from "./schema";
import type { TelemetryPayloadByName } from "./types";

function safely(emit: () => void): void {
    try {
        emit();
    } catch {
        // Telemetry must never break the page.
    }
}

/** One per route view. `feature` is the first route segment (a stable id), never an id from the path. */
export function emitFeatureViewed(routePattern: string): void {
    safely(() => {
        const feature = routePattern.split("/").filter(Boolean)[0] ?? "home";
        trackTelemetryEvent("feature_viewed", { feature, surface: "route", routePattern });
    });
}

type FilterKey = TelemetryPayloadByName["filter_changed"]["filterKey"];

const sorted = (values: readonly string[] | undefined) => [...(values ?? [])].sort().join("\u0000");

/** The filter dimensions compared, with their value count. A date change counts as one value. */
function dimensions(filter: MetricFilter): Array<[FilterKey, string, number]> {
    const list = (values: readonly string[] | undefined): [string, number] => [
        sorted(values),
        values?.length ?? 0,
    ];
    return [
        ["scope", `${filter.scope.level}|${sorted(filter.scope.ids)}`, filter.scope.ids.length],
        [
            "date",
            `${filter.time.range_days}|${filter.time.start_date ?? ""}|${filter.time.end_date ?? ""}`,
            1,
        ],
        ["developer", ...list(filter.who.developers)],
        ["repo", ...list(filter.what.repos)],
        ["work", ...list(filter.why.work_category)],
        ["flow", ...list(filter.how.wip_state)],
    ];
}

const PRESET_DAYS = new Set([7, 14, 30, 60, 90]);

/**
 * One `filter_changed` per filter dimension whose value really changed between `previous`
 * and `next`. Nothing is sent for an identical value.
 */
export function emitFilterChanges(view: string, previous: MetricFilter, next: MetricFilter): void {
    safely(() => {
        const before = dimensions(previous);
        dimensions(next).forEach(([filterKey, signature, valueCount], index) => {
            if (before[index][1] === signature) return;
            trackTelemetryEvent("filter_changed", {
                view,
                filterKey,
                valueCount,
                isCustomDateRange:
                    filterKey === "date" ? !PRESET_DAYS.has(next.time.range_days) : null,
            });
        });
    });
}

const MAX_CLIENT_ERRORS_PER_PAGE_LOAD = 20;
let clientErrorsSent = 0;

export function resetClientErrorBudgetForTests(): void {
    clientErrorsSent = 0;
}

/** A class name from the closed list (`TypeError`, `ChunkLoadError`), else `Error`. The message and stack can hold user data. */
export function errorClassOf(error: unknown): string {
    const name = error instanceof Error ? error.name : "";
    return (ERROR_CLASSES as readonly string[]).includes(name) ? name : "Error";
}

/** `boundary`: an error boundary (`route`) or a window-level handler / global boundary (`global`). */
export function emitClientError(
    boundary: TelemetryPayloadByName["client_error"]["boundary"],
    error: unknown,
): void {
    safely(() => {
        if (clientErrorsSent >= MAX_CLIENT_ERRORS_PER_PAGE_LOAD) return;
        clientErrorsSent += 1;
        const digest =
            typeof error === "object" && error !== null && "digest" in error
                ? String((error as { digest?: unknown }).digest ?? "") || null
                : null;
        const pathname = typeof window === "undefined" ? null : window.location.pathname;
        trackTelemetryEvent("client_error", {
            boundary,
            digest,
            errorClass: errorClassOf(error),
            routePattern: pathname ? routePatternForPathname(pathname) : null,
        });
    });
}

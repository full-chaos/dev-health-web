import type { ReactNode } from "react";

import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";

/**
 * Controlled "why is there nothing to show" taxonomy (CHAOS-2061 / Framework A11).
 *
 * `DataState` is the single, customer-safe vocabulary for distinguishing the
 * reasons a panel, table, or chart cannot render a result. It composes the base
 * {@link EmptyState} (dashed, calm) and {@link ErrorCard} (negative-accent,
 * alarmed) so an *error* never looks like an *empty* — the two are visually
 * distinct by construction.
 *
 * The variants extend the Phase-1 cockpit vocabulary (see
 * {@link CockpitEmptyState}) so the whole product speaks one language rather
 * than inventing per-panel copy. Copy is trust-preserving: it never implies a
 * finding ("healthy", "all clear"), never leaks internal detector/telemetry
 * names, and uses tentative language (appears, leans, suggests).
 *
 * | variant                       | meaning                                              |
 * | ----------------------------- | ---------------------------------------------------- |
 * | no-data-connected             | No source feeds this view yet.                       |
 * | source-unsupported            | A source is connected but does not feed this view.   |
 * | detector-unavailable          | Sources connected, but the result can't be computed. |
 * | detector-enabled-no-findings  | The view ran and surfaced nothing for the window.    |
 * | insufficient-confidence        | Some evidence, but not enough to show a result.      |
 * | preview-not-populated         | A preview that hasn't been populated for this scope. |
 * | loading                       | Result is being computed/fetched.                    |
 * | error                         | The request failed (visually distinct from empty).   |
 */
export type DataStateVariant =
    | "no-data-connected"
    | "source-unsupported"
    | "detector-unavailable"
    | "detector-enabled-no-findings"
    | "insufficient-confidence"
    | "preview-not-populated"
    | "loading"
    | "error";

type VariantCopy = {
    title: string;
    description: string;
};

/**
 * Default copy per non-loading/non-error variant. Loading and error supply
 * their own (skeleton / ErrorCard) and are intentionally absent here.
 */
const VARIANT_COPY: Record<Exclude<DataStateVariant, "loading" | "error">, VariantCopy> = {
    "no-data-connected": {
        title: "No data connected",
        description:
            "Connect a source to start populating this view. Until then there is nothing to summarize.",
    },
    "source-unsupported": {
        title: "Source not supported yet",
        description:
            "A source is connected, but it does not yet feed this view. Connect a supported source to populate it.",
    },
    "detector-unavailable": {
        title: "Connected but detector unavailable",
        description:
            "Sources are connected, but this view could not be computed for the selected window.",
    },
    "detector-enabled-no-findings": {
        title: "Enabled but no findings",
        description: "This view ran and surfaced nothing notable in the selected window.",
    },
    "insufficient-confidence": {
        title: "Insufficient confidence",
        description:
            "There is some evidence, but not enough to show a reliable result for this window.",
    },
    "preview-not-populated": {
        title: "Preview not populated yet",
        description:
            "This preview has not been populated for the selected scope. It appears once there is enough data to show without estimating values.",
    },
};

type DataStateProps = {
    variant: DataStateVariant;
    /** Optional override for the default variant title. */
    title?: string;
    /** Optional override for the default variant description (empty variants). */
    description?: string;
    /** Error detail for the `error` variant (falls back to `description`). */
    message?: string;
    /** Optional leading icon, forwarded to the base EmptyState. */
    icon?: ReactNode;
    /** Optional call-to-action (e.g. a "Connect a source" link). */
    action?: ReactNode;
    /** Optional wrapper className for layout (e.g. padding inside a card). */
    className?: string;
    /**
     * Optional supplemental detail rendered below the description — intended
     * for "Data source needed:" context on `detector-unavailable` panels. Pass
     * the value only (e.g. "Review activity rollups for AI-attributed PRs");
     * DataState adds the "Data source needed:" label automatically.
     */
    detail?: string;
    /** Test hook; defaults to a stable per-variant id. */
    "data-testid"?: string;
};

export function DataState({
    variant,
    title,
    description,
    message,
    icon,
    action,
    className,
    detail,
    "data-testid": testId,
}: DataStateProps) {
    if (variant === "loading") {
        return (
            <div
                role="status"
                aria-busy="true"
                data-variant="loading"
                data-testid={testId ?? "data-state-loading"}
                className={className}
            >
                <span className="sr-only">{title ?? "Loading…"}</span>
                <div
                    className="h-24 w-full animate-pulse rounded-3xl bg-(--card-80)"
                    aria-hidden="true"
                />
            </div>
        );
    }

    if (variant === "error") {
        return (
            <div
                data-variant="error"
                data-testid={testId ?? "data-state-error"}
                className={className}
            >
                <ErrorCard
                    title={title ?? "Something went wrong"}
                    message={
                        message ??
                        description ??
                        "The request could not be completed. Please retry."
                    }
                    action={action}
                />
            </div>
        );
    }

    const copy = VARIANT_COPY[variant];
    return (
        <div
            data-variant={variant}
            data-testid={testId ?? `data-state-${variant}`}
            className={className}
        >
            <EmptyState
                icon={icon}
                title={title ?? copy.title}
                description={description ?? copy.description}
                action={action}
            />
            {detail && (
                <p className="mt-3 rounded-2xl bg-background/60 px-3 py-2 text-center text-xs text-(--ink-muted)">
                    Data source needed: {detail}
                </p>
            )}
        </div>
    );
}

import type { ReactNode } from "react";

import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Phase-1 customer-safe sparse/empty states for the cockpit (CHAOS-2052).
 *
 * VENDORED for branch isolation: the canonical owner of this file is
 * trust-states (CHAOS-2052). signal-cards (CHAOS-2050) consumes it so the
 * feat/chaos-2050-ranked-signals branch compiles and tests standalone. On
 * integration KEEP trust-states' copy and drop this one (content is identical).
 *
 * These variants are the ONLY approved vocabulary for distinguishing *why* a
 * cockpit panel has nothing to show. They are trust-preserving: they never
 * imply a finding ("healthy", "all clear") and never leak internal detector
 * names. Exported so signal-cards (and any other cockpit panel) reuse the exact
 * same wording rather than inventing per-panel copy.
 *
 * | variant                  | meaning                                          |
 * | ------------------------ | ------------------------------------------------ |
 * | no-data-connected        | No source feeds this panel yet.                  |
 * | detector-unavailable     | Sources connected, but the detector can't run.   |
 * | no-findings              | Detector ran and surfaced nothing for the window.|
 * | insufficient-confidence  | Some evidence, but not enough to show a result.  |
 */
export type CockpitEmptyStateVariant =
  | "no-data-connected"
  | "detector-unavailable"
  | "no-findings"
  | "insufficient-confidence";

type VariantCopy = {
  title: string;
  description: string;
};

const VARIANT_COPY: Record<CockpitEmptyStateVariant, VariantCopy> = {
  "no-data-connected": {
    title: "No data connected",
    description:
      "Connect a source to start populating this view. Until then there is nothing to summarize.",
  },
  "detector-unavailable": {
    title: "Connected but detector unavailable",
    description:
      "Sources are connected, but this signal could not be computed for the selected window.",
  },
  "no-findings": {
    title: "Enabled but no findings",
    description: "This signal ran and surfaced nothing notable in the selected window.",
  },
  "insufficient-confidence": {
    title: "Insufficient confidence",
    description:
      "There is some evidence, but not enough to show a reliable result for this window.",
  },
};

type CockpitEmptyStateProps = {
  variant: CockpitEmptyStateVariant;
  /** Optional override for the default variant title. */
  title?: string;
  /** Optional override for the default variant description. */
  description?: string;
  /** Optional leading icon, forwarded to the base EmptyState. */
  icon?: ReactNode;
  /** Optional call-to-action (e.g. a "Connect a source" link). */
  action?: ReactNode;
  /** Test hook; defaults to a stable per-variant id. */
  "data-testid"?: string;
};

export function CockpitEmptyState({
  variant,
  title,
  description,
  icon,
  action,
  "data-testid": testId,
}: CockpitEmptyStateProps) {
  const copy = VARIANT_COPY[variant];
  return (
    <div data-testid={testId ?? `cockpit-empty-${variant}`} data-variant={variant}>
      <EmptyState
        icon={icon}
        title={title ?? copy.title}
        description={description ?? copy.description}
        action={action}
      />
    </div>
  );
}

import type { ReactNode } from "react";

import {
  CONFIDENCE_SHOW_THRESHOLD,
  CONFIDENCE_WARN_THRESHOLD,
  GATE_COPY,
} from "@/lib/feature-flags/interpretation";

type GateLevel = "show" | "warn" | "suppress";

function resolveGateLevel(coverage: number, minSampleMet: boolean): GateLevel {
  if (coverage >= CONFIDENCE_SHOW_THRESHOLD && minSampleMet) return "show";
  if (coverage >= CONFIDENCE_WARN_THRESHOLD) return "warn";
  return "suppress";
}

interface ConfidenceGateProps {
  coverage: number;
  minSampleMet: boolean;
  children: ReactNode;
  suppressedMessage?: string;
}

export function ConfidenceGate({
  coverage,
  minSampleMet,
  children,
  suppressedMessage,
}: ConfidenceGateProps) {
  const level = resolveGateLevel(coverage, minSampleMet);

  if (level === "suppress") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-70) py-12 text-center">
        <div className="rounded-full bg-(--accent-negative)/10 p-3 text-(--accent-negative)">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>
        <p className="max-w-sm text-sm text-(--ink-muted)">
          {suppressedMessage ?? GATE_COPY.suppressedDefault}
        </p>
        <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-red-400">
          Coverage {Math.round(coverage * 100)}%
        </span>
      </div>
    );
  }

  if (level === "warn") {
    return (
      <div className="relative rounded-3xl border border-amber-500/30 p-px">
        <div
          className="absolute -top-3 left-4 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-400"
          title={GATE_COPY.warnTooltip}
        >
          Reduced confidence
        </div>
        <div className="rounded-3xl bg-(--card-80) p-4">{children}</div>
        <p className="px-4 pb-3 text-[11px] text-amber-400/80">{GATE_COPY.warnTooltip}</p>
      </div>
    );
  }

  return <>{children}</>;
}

export { resolveGateLevel };
export type { GateLevel };

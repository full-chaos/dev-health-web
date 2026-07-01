// ── Deterministic Diagnose sample data for DEV_HEALTH_TEST_MODE (CHAOS-2223) ──
//
// Mirrors the established TestOps/AI convention: typed constants returned by
// the resolver instead of hitting the network, flowing through the REAL
// severity derivation in areaSignals/diagnose.ts (never bypassing it):
//
//   complexity     → "medium" (mean cyclomaticPerKloc 22 → >=15, <25)
//   landscape      → "high"   (bus factor 1.8 → >=1.5, <2, higherIsBetter)
//   cognitive-load → "low"    (avg interruption load 6 → <8)
//
// Bus factor previously short-circuited to `null` in test mode (CHAOS-2035: a
// shared MSW `BusFactor` mock, reused by the /code ownership card, leaked an
// available Landscape hero into the Diagnose overview at a time when no
// deterministic-sample-data convention existed). Providing our OWN typed
// constant here — never touching `getBusFactorData` or the shared mock —
// sidesteps that regression: Diagnose test-mode data no longer depends on (or
// can drift with) the /code page's mock value.

import type { ComplexityTimeseriesResult } from "@/lib/graphql/__generated__/types";
import type { BusFactor } from "@/lib/graphql/types";
import type { CognitiveLoadResult } from "@/lib/graphql/cognitiveLoadFetchers";

const SAMPLE_ORG_ID = "default-org";
const SAMPLE_DATE = "2026-06-09";

export const SAMPLE_DIAGNOSE_COMPLEXITY: ComplexityTimeseriesResult = {
    points: [
        {
            date: SAMPLE_DATE,
            scopeId: "sample-repo-web",
            scopeName: "sample/web-app",
            cyclomaticPerKloc: 28,
            cyclomaticAvg: 14,
            cyclomaticTotal: 280,
            locTotal: 10000,
            highComplexityFunctions: 12,
            veryHighComplexityFunctions: 2,
        },
        {
            date: SAMPLE_DATE,
            scopeId: "sample-repo-api",
            scopeName: "sample/api",
            cyclomaticPerKloc: 16,
            cyclomaticAvg: 9,
            cyclomaticTotal: 96,
            locTotal: 6000,
            highComplexityFunctions: 5,
            veryHighComplexityFunctions: 0,
        },
    ],
    totalScope: 2,
};

export const SAMPLE_DIAGNOSE_BUS_FACTOR: BusFactor = {
    orgId: SAMPLE_ORG_ID,
    scope: { repoId: null, teamId: null },
    value: 1.8,
    topMaintainers: [
        { author: "sample-maintainer-1@example.com", sharePercent: 64.5 },
        { author: "sample-maintainer-2@example.com", sharePercent: 35.5 },
    ],
    repos: [
        {
            repoId: "sample-repo-web",
            repoName: "sample/web-app",
            value: 1.8,
            topMaintainers: [{ author: "sample-maintainer-1@example.com", sharePercent: 64.5 }],
            evidenceSampleCount: 420,
        },
    ],
    evidenceSampleCount: 420,
};

export const SAMPLE_DIAGNOSE_COGNITIVE_LOAD: CognitiveLoadResult = {
    orgId: SAMPLE_ORG_ID,
    teamId: null,
    totalDays: 3,
    signals: [
        {
            day: "2026-06-07",
            prInterruptionLoad: 6,
            contextSpreadCount: 20,
            reviewRequestLoad: 3,
            afterHoursCommitRatio: 0.1,
            weekendCommitRatio: 0.05,
        },
        {
            day: "2026-06-08",
            prInterruptionLoad: 7,
            contextSpreadCount: 22,
            reviewRequestLoad: 4,
            afterHoursCommitRatio: 0.12,
            weekendCommitRatio: 0.06,
        },
        {
            day: SAMPLE_DATE,
            prInterruptionLoad: 5,
            contextSpreadCount: 18,
            reviewRequestLoad: 2,
            afterHoursCommitRatio: 0.08,
            weekendCommitRatio: 0.04,
        },
    ],
};

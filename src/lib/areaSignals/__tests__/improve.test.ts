import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock every Improve source at the module boundary ──────────────────────────
// The resolver fans out to these; we drive each independently to assert the
// source → AreaSignal mapping (RETURNED vs "neutral" vs "unavailable").

vi.mock("@/lib/graphql/server", () => ({ graphqlFetch: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { org_id: "org-test" } }),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { graphqlFetch } from "@/lib/graphql/server";
import { defaultMetricFilter } from "@/lib/filters/defaults";

import { getImproveSignals } from "../improve";
import type { AreaSignal } from "../types";

const mockGraphql = vi.mocked(graphqlFetch);

function byId(signals: AreaSignal[]): Record<string, AreaSignal> {
  return Object.fromEntries(signals.map((s) => [s.id, s]));
}

/** Minimal ThroughputForecast stub — primaryRisk.active=false → "low". */
function mockThroughput(overrides: {
  insufficientHistory?: boolean;
  primaryRiskActive?: boolean;
  p50Weeks?: number | null;
}) {
  return {
    throughputForecast: {
      forecastId: "f1",
      computedAt: "2026-06-03T00:00:00Z",
      teamId: null,
      workScopeId: null,
      backlogSize: 50,
      historyWeeks: 12,
      p50Weeks: overrides.p50Weeks ?? 6,
      p75Weeks: 8,
      p90Weeks: 10,
      insufficientHistory: overrides.insufficientHistory ?? false,
      rollingWindows: [],
      primaryRisk: {
        kind: "WIP",
        score: 0.3,
        label: "WIP pressure",
        value: 0.3,
        threshold: 0.5,
        active: overrides.primaryRiskActive ?? false,
      },
      wipCongestion: { kind: "WIP", score: 0, label: "", value: 0, threshold: 0, active: false },
      reviewBottleneck: {
        kind: "REVIEW",
        score: 0,
        label: "",
        value: 0,
        threshold: 0,
        active: false,
      },
      incidentLoad: {
        kind: "INCIDENT",
        score: 0,
        label: "",
        value: 0,
        threshold: 0,
        active: false,
      },
    },
  };
}

/** Minimal AIImpactSummary stub — dataAvailable=true, ratio=0.42 → "42%" neutral. */
function mockAIImpact(overrides: { dataAvailable?: boolean; aiAssistedPrRatio?: number | null }) {
  return {
    aiImpactSummary: {
      orgId: "org-test",
      startDate: "2026-05-20",
      endDate: "2026-06-03",
      totalPrs: 100,
      aiAssistedPrs: 42,
      agentCreatedPrs: 10,
      humanPrs: 58,
      unknownPrs: 0,
      aiAssistedPrRatio: overrides.aiAssistedPrRatio ?? 0.42,
      dataAvailable: overrides.dataAvailable ?? true,
      computedAt: null,
      byBucket: [],
      daily: [],
      missingStates: [],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: both sources healthy.
  mockGraphql.mockImplementation((query: unknown) => {
    const q = String(query);
    if (q.includes("throughputForecast")) {
      return Promise.resolve(mockThroughput({})) as never;
    }
    if (q.includes("aiImpactSummary")) {
      return Promise.resolve(mockAIImpact({})) as never;
    }
    return Promise.resolve({}) as never;
  });
});

describe("getImproveSignals — source → AreaSignal mapping", () => {
  it("returns exactly the two Improve hub items (capacity-planning + ai-workflows)", async () => {
    const signals = await getImproveSignals(defaultMetricFilter);
    const ids = signals.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(["capacity-planning", "ai-workflows"]));
    expect(ids).toHaveLength(2);
  });

  it("Capacity Planning: RETURNED state low when primaryRisk.active is false", async () => {
    const signals = byId(await getImproveSignals(defaultMetricFilter));
    expect(signals["capacity-planning"]).toMatchObject({
      state: "low",
      value: "6w",
      id: "capacity-planning",
    });
  });

  it("Capacity Planning: RETURNED state medium when primaryRisk.active is true", async () => {
    mockGraphql.mockImplementation((query: unknown) => {
      const q = String(query);
      if (q.includes("throughputForecast")) {
        return Promise.resolve(mockThroughput({ primaryRiskActive: true })) as never;
      }
      return Promise.resolve(mockAIImpact({})) as never;
    });
    const signals = byId(await getImproveSignals(defaultMetricFilter));
    expect(signals["capacity-planning"]).toMatchObject({ state: "medium" });
  });

  it("Capacity Planning: unavailable when insufficientHistory is true", async () => {
    mockGraphql.mockImplementation((query: unknown) => {
      const q = String(query);
      if (q.includes("throughputForecast")) {
        return Promise.resolve(mockThroughput({ insufficientHistory: true })) as never;
      }
      return Promise.resolve(mockAIImpact({})) as never;
    });
    const signals = byId(await getImproveSignals(defaultMetricFilter));
    expect(signals["capacity-planning"]).toMatchObject({ state: "unavailable", value: "" });
  });

  it("Capacity Planning: unavailable when throughputForecast is null", async () => {
    mockGraphql.mockImplementation((query: unknown) => {
      const q = String(query);
      if (q.includes("throughputForecast")) {
        return Promise.resolve({ throughputForecast: null }) as never;
      }
      return Promise.resolve(mockAIImpact({})) as never;
    });
    const signals = byId(await getImproveSignals(defaultMetricFilter));
    expect(signals["capacity-planning"]).toMatchObject({ state: "unavailable", value: "" });
  });

  it("AI Workflows: always 'neutral' (adoption metric, never a severity)", async () => {
    const signals = byId(await getImproveSignals(defaultMetricFilter));
    const ai = signals["ai-workflows"];
    expect(ai.state).toBe("neutral");
    // 0.42 × 100 → formatPercent → "42%"
    expect(ai.value).toBe("42%");
  });

  it("AI Workflows: unavailable when dataAvailable is false", async () => {
    mockGraphql.mockImplementation((query: unknown) => {
      const q = String(query);
      if (q.includes("aiImpactSummary")) {
        return Promise.resolve(mockAIImpact({ dataAvailable: false })) as never;
      }
      return Promise.resolve(mockThroughput({})) as never;
    });
    const signals = byId(await getImproveSignals(defaultMetricFilter));
    expect(signals["ai-workflows"]).toMatchObject({ state: "unavailable", value: "" });
  });

  it("AI Workflows: unavailable when aiImpactSummary is missing", async () => {
    mockGraphql.mockImplementation((query: unknown) => {
      const q = String(query);
      if (q.includes("aiImpactSummary")) {
        // Simulate graphqlFetch throwing (query fails entirely).
        return Promise.reject(new Error("ai down")) as never;
      }
      return Promise.resolve(mockThroughput({})) as never;
    });
    const signals = byId(await getImproveSignals(defaultMetricFilter));
    expect(signals["ai-workflows"]).toMatchObject({ state: "unavailable", value: "" });
  });

  it("degrades a failed Capacity Planning source to unavailable without throwing", async () => {
    mockGraphql.mockImplementation((query: unknown) => {
      const q = String(query);
      if (q.includes("throughputForecast")) {
        return Promise.reject(new Error("throughput down")) as never;
      }
      return Promise.resolve(mockAIImpact({})) as never;
    });
    const signals = byId(await getImproveSignals(defaultMetricFilter));
    expect(signals["capacity-planning"]).toMatchObject({ state: "unavailable" });
    // Other source still resolves.
    expect(signals["ai-workflows"].state).toBe("neutral");
  });

  it("degrades both sources independently — full degradation still returns two cards", async () => {
    mockGraphql.mockRejectedValue(new Error("all sources down"));
    const signals = await getImproveSignals(defaultMetricFilter);
    expect(signals).toHaveLength(2);
    for (const s of signals) {
      expect(s.state).toBe("unavailable");
      expect(s.value).toBe("");
    }
  });

  it("no signal carries a cluster (Improve is flat per the nav descriptor)", async () => {
    const signals = await getImproveSignals(defaultMetricFilter);
    for (const s of signals) {
      expect(s.cluster).toBeUndefined();
    }
  });

  it("isTestMode: returns both signals as unavailable without calling GraphQL", async () => {
    const signals = byId(await getImproveSignals(defaultMetricFilter, true));
    // In test mode, fetchers are skipped (Promise.resolve(undefined)) → both unavailable.
    expect(signals["capacity-planning"]).toMatchObject({ state: "unavailable" });
    expect(signals["ai-workflows"]).toMatchObject({ state: "unavailable" });
    // graphqlFetch was never called (mocks not invoked).
    expect(mockGraphql).not.toHaveBeenCalled();
  });
});

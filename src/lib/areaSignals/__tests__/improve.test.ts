import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock the Improve source at the module boundary ────────────────────────────
// The resolver calls getOpportunities; we drive it independently to assert the
// source → AreaSignal mapping without any network.

vi.mock("@/lib/api/home", () => ({
    getOpportunities: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getOpportunities } from "@/lib/api/home";
import { defaultMetricFilter } from "@/lib/filters/defaults";

import { getImproveSignals } from "../improve";
import type { AreaSignal } from "../types";

const mockGetOpportunities = vi.mocked(getOpportunities);

function byId(signals: AreaSignal[]): Record<string, AreaSignal> {
    return Object.fromEntries(signals.map((s) => [s.id, s]));
}

const opportunityItem = (evidenceLinks: string[] = []) => ({
    id: "opp-1",
    title: "Reduce cycle time",
    rationale: "Cycle time is high",
    evidence_links: evidenceLinks,
    suggested_experiments: [],
});

beforeEach(() => {
    vi.clearAllMocks();
    // Default: some opportunities with evidence links
    mockGetOpportunities.mockResolvedValue({
        items: [
            opportunityItem(["https://example.com/evidence"]),
            opportunityItem([]),
        ],
    } as never);
});

describe("getImproveSignals — Improve area signals (CHAOS-2217)", () => {
    it("returns real Opportunities signal with count and evidence-linked count", async () => {
        const signals = byId(await getImproveSignals(defaultMetricFilter));

        expect(signals.opportunities).toMatchObject({
            id: "opportunities",
            label: "Opportunities",
            href: "/opportunities",
            state: "neutral",
            value: "2 OPEN · 1 EVIDENCE-LINKED",
        });
    });

    it("shows only OPEN count when no evidence-linked opportunities", async () => {
        mockGetOpportunities.mockResolvedValue({
            items: [opportunityItem([]), opportunityItem([])],
        } as never);

        const signals = byId(await getImproveSignals(defaultMetricFilter));
        expect(signals.opportunities).toMatchObject({
            state: "neutral",
            value: "2 OPEN",
        });
    });

    it("emits UNAVAILABLE for Opportunities when fetch returns empty items", async () => {
        mockGetOpportunities.mockResolvedValue({ items: [] } as never);

        const signals = byId(await getImproveSignals(defaultMetricFilter));
        expect(signals.opportunities).toMatchObject({
            state: "unavailable",
            value: "",
        });
    });

    it("degrades Opportunities to UNAVAILABLE when fetch fails", async () => {
        mockGetOpportunities.mockRejectedValue(new Error("backend down"));

        const signals = byId(await getImproveSignals(defaultMetricFilter));
        expect(signals.opportunities).toMatchObject({
            state: "unavailable",
            value: "",
        });
        // Other signals still resolve
        expect(signals.experiments).toMatchObject({ state: "unavailable" });
        expect(signals["improve-automations"]).toMatchObject({
            state: "unavailable",
        });
    });

    it("emits honest UNAVAILABLE for Experiments (no backend)", async () => {
        const signals = byId(await getImproveSignals(defaultMetricFilter));

        expect(signals.experiments).toMatchObject({
            id: "experiments",
            label: "Experiments",
            href: "/improve/experiments",
            state: "unavailable",
            value: "",
        });
    });

    it("emits honest UNAVAILABLE for Automations (no backend)", async () => {
        const signals = byId(await getImproveSignals(defaultMetricFilter));

        expect(signals["improve-automations"]).toMatchObject({
            id: "improve-automations",
            label: "Automations",
            href: "/improve/automations",
            state: "unavailable",
            value: "",
        });
    });

    it("returns all 3 Improve sub-areas exactly once", async () => {
        const signals = await getImproveSignals(defaultMetricFilter);
        const ids = signals.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toEqual(
            expect.arrayContaining([
                "opportunities",
                "experiments",
                "improve-automations",
            ]),
        );
        expect(ids).toHaveLength(3);
    });

    it("sorts real signals first, unavailable last", async () => {
        const signals = await getImproveSignals(defaultMetricFilter);
        // Opportunities (neutral) should come before Experiments/Automations (unavailable)
        const opportunitiesIdx = signals.findIndex(
            (s) => s.id === "opportunities",
        );
        const experimentsIdx = signals.findIndex((s) => s.id === "experiments");
        const automationsIdx = signals.findIndex(
            (s) => s.id === "improve-automations",
        );
        expect(opportunitiesIdx).toBeLessThan(experimentsIdx);
        expect(opportunitiesIdx).toBeLessThan(automationsIdx);
    });

    it("uses filters (passes them to getOpportunities, not voided)", async () => {
        const customFilter = {
            ...defaultMetricFilter,
            time: { range_days: 30, compare_days: 30 },
        };
        await getImproveSignals(customFilter);
        expect(mockGetOpportunities).toHaveBeenCalledWith(customFilter);
    });

    it("in test mode: skips network fetch and returns all signals as UNAVAILABLE", async () => {
        const signals = await getImproveSignals(defaultMetricFilter, true);
        // getOpportunities must NOT be called in test mode
        expect(mockGetOpportunities).not.toHaveBeenCalled();
        // All 3 signals must be present
        expect(signals).toHaveLength(3);
        for (const signal of signals) {
            expect(signal.state).toBe("unavailable");
            expect(signal.value).toBe("");
        }
    });
});

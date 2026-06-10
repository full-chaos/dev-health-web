import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock the Improve sources at the module boundary ───────────────────────────
// The resolver calls getOpportunities (count) + getHomeData (deltas → top
// signal); we drive both independently to assert the source → AreaSignal mapping
// without any network.

vi.mock("@/lib/api/home", () => ({
    getOpportunities: vi.fn(),
    getHomeData: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getHomeData, getOpportunities } from "@/lib/api/home";
import { defaultMetricFilter } from "@/lib/filters/defaults";

import { getImproveSignals } from "../improve";
import type { AreaSignal } from "../types";

const mockGetOpportunities = vi.mocked(getOpportunities);
const mockGetHomeData = vi.mocked(getHomeData);

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

const delta = (label: string, deltaPct: number, metric = label.toLowerCase()) => ({
    metric,
    label,
    value: 0,
    unit: "%",
    delta_pct: deltaPct,
    spark: [],
});

// Home payload with only the fields the resolver reads (deltas). Other required
// HomeResponse fields are irrelevant to the top-signal derivation.
const homeWithDeltas = (deltas: ReturnType<typeof delta>[]) => ({ deltas }) as never;

beforeEach(() => {
    vi.clearAllMocks();
    // Default: some opportunities with evidence links + a worsened metric so the
    // synthesized top signal is present.
    mockGetOpportunities.mockResolvedValue({
        items: [opportunityItem(["https://example.com/evidence"]), opportunityItem([])],
    } as never);
    mockGetHomeData.mockResolvedValue(
        homeWithDeltas([delta("Churn", 19), delta("Cycle Time", 8), delta("Coverage", -4)]),
    );
});

describe("getImproveSignals — Improve area signals (CHAOS-2217)", () => {
    // ── Top signal (synthesized worst opportunity) ────────────────────────────────

    it("gates the TOP SIGNAL by polarity (throughput up = NOT hero, churn up = hero, throughput down = 'Recover' hero)", async () => {
        // Throughput up (+10) is GOOD (higher-is-better). Churn up (+5) is BAD (lower-is-better).
        // Throughput down (-15) is BAD (higher-is-better).
        mockGetHomeData.mockResolvedValue(
            homeWithDeltas([
                delta("Throughput", 10), // Good
                delta("Churn", 5), // Bad
                delta("Deploy Freq", -15, "deploy_freq"), // Bad
            ]),
        );
        const signals = byId(await getImproveSignals(defaultMetricFilter));
        expect(signals["improve-top-signal"]).toMatchObject({
            label: "Recover Deploy Freq",
            value: "-15%",
            state: "high",
            direction: "down",
        });
    });

    it("promotes a declining higher-is-better metric (coverage) over a smaller lower-is-better rise", async () => {
        // Coverage falling 12% is WORSE than churn rising 6% — the catalog polarity
        // must classify coverage (higher-is-better) as worsened on a NEGATIVE delta.
        mockGetHomeData.mockResolvedValue(
            homeWithDeltas([
                delta("Churn", 6), // Bad, but smaller magnitude
                delta("Coverage", -12), // Worse: higher-is-better metric declining
            ]),
        );
        const signals = byId(await getImproveSignals(defaultMetricFilter));
        expect(signals["improve-top-signal"]).toMatchObject({
            label: "Recover Coverage",
            value: "-12%",
            state: "medium",
            direction: "down",
        });
    });

    it("NEVER promotes a metric with unknown polarity to the hero (fails closed)", async () => {
        // A metric key absent from the catalog must be excluded from hero
        // promotion entirely — never assumed lower-is-better.
        mockGetHomeData.mockResolvedValue(
            homeWithDeltas([delta("Mystery Metric", 42, "mystery_metric")]),
        );
        const signals = byId(await getImproveSignals(defaultMetricFilter));
        expect(signals["improve-top-signal"]).toBeUndefined();
    });

    it("synthesizes a TOP SIGNAL from the worst worsened metric (label + signed delta + severity)", async () => {
        const signals = byId(await getImproveSignals(defaultMetricFilter));

        expect(signals["improve-top-signal"]).toMatchObject({
            id: "improve-top-signal",
            label: "Reduce Churn",
            href: "/opportunities",
            value: "+19%",
            // +19% maps to "high" (Penpot's ELEVATED lead), NOT neutral.
            state: "high",
            direction: "up",
        });
        // The secondary line frames the metric, it does NOT just repeat the label.
        expect(signals["improve-top-signal"].metricLabel).toBe("Churn shift");
    });

    it("makes the TOP SIGNAL the most-severe available signal (sorts above Opportunities)", async () => {
        const signals = await getImproveSignals(defaultMetricFilter);
        const topIdx = signals.findIndex((s) => s.id === "improve-top-signal");
        const oppIdx = signals.findIndex((s) => s.id === "opportunities");
        expect(topIdx).toBeGreaterThanOrEqual(0);
        // Worst-opportunity hero outranks the neutral Opportunities count card.
        expect(topIdx).toBeLessThan(oppIdx);
    });

    it("picks the LARGEST absolute delta in the wrong direction as the top signal (not the first)", async () => {
        mockGetHomeData.mockResolvedValue(
            homeWithDeltas([
                delta("Cycle Time", 8),
                delta("Throughput", -27), // Bad
                delta("Churn", 12), // Bad
            ]),
        );
        const signals = byId(await getImproveSignals(defaultMetricFilter));
        expect(signals["improve-top-signal"]).toMatchObject({
            label: "Recover Throughput",
            value: "-27%",
            // ≥25 → critical.
            state: "critical",
        });
    });

    it("maps delta magnitude onto the severity ladder", async () => {
        const cases: Array<[number, string]> = [
            [30, "critical"],
            [20, "high"],
            [9, "medium"],
            [2, "low"],
        ];
        for (const [deltaPct, expected] of cases) {
            mockGetHomeData.mockResolvedValue(homeWithDeltas([delta("Churn", deltaPct)]));
            const signals = byId(await getImproveSignals(defaultMetricFilter));
            expect(signals["improve-top-signal"].state, `${deltaPct}% → ${expected}`).toBe(
                expected,
            );
        }
    });

    it("omits the TOP SIGNAL when NO metric worsened (Opportunities leads as neutral, no fabricated severity)", async () => {
        mockGetHomeData.mockResolvedValue(
            homeWithDeltas([delta("Throughput", 5), delta("Cycle Time", -2)]),
        );
        const signals = await getImproveSignals(defaultMetricFilter);
        expect(signals.find((s) => s.id === "improve-top-signal")).toBeUndefined();
        // The lead available signal is now Opportunities (neutral), never a fake severity.
        const available = signals.filter((s) => s.state !== "unavailable");
        expect(available[0].id).toBe("opportunities");
        expect(available.every((s) => s.state === "neutral")).toBe(true);
    });

    it("omits the TOP SIGNAL when there are zero open opportunities (hero must link to a real opportunity)", async () => {
        mockGetOpportunities.mockResolvedValue({ items: [] } as never);
        // Even with a worsened metric, no opportunities → no synthesized hero.
        const signals = await getImproveSignals(defaultMetricFilter);
        expect(signals.find((s) => s.id === "improve-top-signal")).toBeUndefined();
    });

    it("omits the TOP SIGNAL when home data is unavailable (no deltas to rank)", async () => {
        mockGetHomeData.mockRejectedValue(new Error("home down"));
        const signals = await getImproveSignals(defaultMetricFilter);
        expect(signals.find((s) => s.id === "improve-top-signal")).toBeUndefined();
        // Opportunities still resolves from its own (successful) fetch.
        expect(byId(signals).opportunities).toMatchObject({ state: "neutral" });
    });

    // ── Opportunities workflow card (short value, no rainbow) ──────────────────────

    it("emits a SHORT Opportunities value with the evidence count on the secondary line", async () => {
        const signals = byId(await getImproveSignals(defaultMetricFilter));

        expect(signals.opportunities).toMatchObject({
            id: "opportunities",
            label: "Opportunities",
            href: "/opportunities",
            state: "neutral",
            // SHORT numeric so the gradient metric-hero reads clean (no rainbow phrase).
            value: "2 open",
            // Evidence count moves to the secondary metricLabel line.
            metricLabel: "1 evidence-linked",
        });
        // The long "N OPEN · M EVIDENCE-LINKED" phrase must NOT be the gradient value.
        expect(signals.opportunities.value).not.toContain("·");
        expect(signals.opportunities.value).not.toContain("EVIDENCE");
    });

    it("labels the secondary line 'open opportunities' when none are evidence-linked", async () => {
        mockGetOpportunities.mockResolvedValue({
            items: [opportunityItem([]), opportunityItem([])],
        } as never);

        const signals = byId(await getImproveSignals(defaultMetricFilter));
        expect(signals.opportunities).toMatchObject({
            state: "neutral",
            value: "2 open",
            metricLabel: "open opportunities",
        });
    });

    it("does NOT repeat the card label as its own metricLabel (no 'Opportunities · Opportunities data')", async () => {
        const signals = byId(await getImproveSignals(defaultMetricFilter));
        expect(signals.opportunities.metricLabel).not.toBe("Opportunities");
        expect(signals.opportunities.metricLabel.toLowerCase()).not.toContain("opportunities data");
    });

    it("treats a SUCCESSFUL empty result as a healthy '0 open' neutral (not unavailable)", async () => {
        mockGetOpportunities.mockResolvedValue({ items: [] } as never);

        const signals = byId(await getImproveSignals(defaultMetricFilter));
        expect(signals.opportunities).toMatchObject({
            state: "neutral",
            value: "0 open",
        });
        expect(signals.opportunities.state).not.toBe("unavailable");
    });

    it("degrades Opportunities to UNAVAILABLE ONLY when the fetch fails", async () => {
        mockGetOpportunities.mockRejectedValue(new Error("backend down"));

        const signals = byId(await getImproveSignals(defaultMetricFilter));
        expect(signals.opportunities).toMatchObject({
            state: "unavailable",
            value: "",
        });
        // A failed fetch must NOT masquerade as a "0 open" healthy zero.
        expect(signals.opportunities.value).not.toContain("open");
        // No synthesized hero either (no opportunities to link to).
        expect(signals["improve-top-signal"]).toBeUndefined();
        // Other signals still resolve
        expect(signals.experiments).toMatchObject({ state: "unavailable" });
        expect(signals["improve-automations"]).toMatchObject({
            state: "unavailable",
        });
    });

    // ── Experiments (CHAOS-2219) ──────────────────────────────────────────────────

    it("emits a neutral count for Experiments derived from opportunity suggestions", async () => {
        // Default mock: 2 opportunity cards, each with 0 suggested_experiments → count = 0.
        const signals = byId(await getImproveSignals(defaultMetricFilter));

        expect(signals.experiments).toMatchObject({
            id: "experiments",
            label: "Experiments",
            href: "/improve/experiments",
            state: "neutral",
            metricLabel: "Suggested next steps",
        });
        // Value contains the count and "suggested"; preview is NOT set.
        expect(signals.experiments.value).toContain("suggested");
        expect(signals.experiments.preview).not.toBe(true);
    });

    it("counts suggested_experiments across all opportunity cards", async () => {
        mockGetOpportunities.mockResolvedValue({
            items: [
                { ...opportunityItem(), suggested_experiments: ["Exp A", "Exp B"] },
                { ...opportunityItem(), suggested_experiments: ["Exp C"] },
            ],
        } as never);

        const signals = byId(await getImproveSignals(defaultMetricFilter));
        expect(signals.experiments.value).toBe("3 suggested");
    });

    it("degrades Experiments to UNAVAILABLE when the opportunities fetch fails", async () => {
        mockGetOpportunities.mockRejectedValue(new Error("backend down"));

        const signals = byId(await getImproveSignals(defaultMetricFilter));
        expect(signals.experiments).toMatchObject({
            state: "unavailable",
            value: "",
        });
    });

    it("emits honest UNAVAILABLE + preview for Automations (no backend / no route)", async () => {
        const signals = byId(await getImproveSignals(defaultMetricFilter));

        expect(signals["improve-automations"]).toMatchObject({
            id: "improve-automations",
            label: "Automations",
            href: "/improve/automations",
            state: "unavailable",
            value: "",
            preview: true,
        });
    });

    it("does NOT mark the real Opportunities card as preview (stays clickable)", async () => {
        const signals = byId(await getImproveSignals(defaultMetricFilter));
        expect(signals.opportunities.preview).not.toBe(true);
    });

    it("does NOT mark the Experiments card as preview (route exists, stays clickable)", async () => {
        const signals = byId(await getImproveSignals(defaultMetricFilter));
        expect(signals.experiments.preview).not.toBe(true);
    });

    // ── Shape / ordering / wiring ─────────────────────────────────────────────────

    it("returns the 3 sub-areas plus the synthesized top signal, each once", async () => {
        const signals = await getImproveSignals(defaultMetricFilter);
        const ids = signals.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toEqual(
            expect.arrayContaining([
                "improve-top-signal",
                "opportunities",
                "experiments",
                "improve-automations",
            ]),
        );
        expect(ids).toHaveLength(4);
    });

    it("sorts real signals first, unavailable last", async () => {
        const signals = await getImproveSignals(defaultMetricFilter);
        const opportunitiesIdx = signals.findIndex((s) => s.id === "opportunities");
        const experimentsIdx = signals.findIndex((s) => s.id === "experiments");
        const automationsIdx = signals.findIndex((s) => s.id === "improve-automations");
        expect(opportunitiesIdx).toBeLessThan(experimentsIdx);
        expect(opportunitiesIdx).toBeLessThan(automationsIdx);
    });

    it("uses filters (passes them to both sources, not voided)", async () => {
        const customFilter = {
            ...defaultMetricFilter,
            time: { range_days: 30, compare_days: 30 },
        };
        await getImproveSignals(customFilter);
        expect(mockGetOpportunities).toHaveBeenCalledWith(customFilter);
        expect(mockGetHomeData).toHaveBeenCalledWith(customFilter);
    });

    it("fetches both REST sources UNCONDITIONALLY (isTestMode is not a fetch gate)", async () => {
        // Mirrors getDiagnoseSignals/getGovernSignals: home + opportunities are
        // MSW-mockable REST, so they are always fetched (under Playwright the dev
        // server points BACKEND_URL at the mock). isTestMode must NOT short-circuit
        // them, or the Overview would render an all-empty hero in e2e.
        await getImproveSignals(defaultMetricFilter, true);
        expect(mockGetOpportunities).toHaveBeenCalledWith(defaultMetricFilter);
        expect(mockGetHomeData).toHaveBeenCalledWith(defaultMetricFilter);
    });

    it("degrades the 3 sub-areas to UNAVAILABLE (no top signal) when BOTH sources fail", async () => {
        // The genuine "not connected" path: both REST fetches throw → safe()
        // swallows to undefined → opportunities unavailable, no deltas to rank.
        // Experiments also degrades to UNAVAILABLE (no preview — route exists).
        // Automations stays preview (route does not yet exist).
        mockGetOpportunities.mockRejectedValue(new Error("opps down"));
        mockGetHomeData.mockRejectedValue(new Error("home down"));

        const signals = await getImproveSignals(defaultMetricFilter, true);
        expect(signals).toHaveLength(3);
        expect(signals.find((s) => s.id === "improve-top-signal")).toBeUndefined();
        for (const signal of signals) {
            expect(signal.state).toBe("unavailable");
            expect(signal.value).toBe("");
        }
        const byIdMap = byId(signals);
        // Experiments has a real route now — UNAVAILABLE but NOT preview.
        expect(byIdMap.experiments.preview).not.toBe(true);
        // Automations still has no route — stays preview.
        expect(byIdMap["improve-automations"].preview).toBe(true);
        expect(byIdMap.opportunities.preview).not.toBe(true);
    });
});

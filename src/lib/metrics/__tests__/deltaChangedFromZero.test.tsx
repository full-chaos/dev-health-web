import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";

import { MetricCard } from "@/components/metrics/MetricCard";
import { associationMeterRows } from "@/components/metrics/associationRows";
import { ReadTheSignal } from "@/components/metrics/ReadTheSignal";
import { NeutralDelta } from "@/components/people/NeutralDelta";
import {
    changedFromZeroLabel,
    changedFromZeroParts,
    isChangedFromZero,
    MetricDelta,
} from "@/components/shared/MetricDelta";
import { sortDeltasByRole } from "@/lib/metrics/catalog";
import { metricCardProps, readDelta } from "@/lib/metrics/metricDisplay";
import type { Contributor, MetricDelta as Row } from "@/lib/types";

// CHAOS-9069: a null percent with both windows measured is "changed from zero". The three
// states of a served percent: a number, no prior data, and a change from zero.
const row = (over: Partial<Row>): Row => ({
    metric: "churn_loc",
    label: "Churn LOC",
    value: 5,
    unit: "loc",
    delta_pct: null,
    has_data: true,
    has_prior_data: true,
    spark: [],
    ...over,
});

const NEVER = /0%|held steady|flat|No prior period|NaN|null/;

describe("shared rule", () => {
    it("tells the three states apart", () => {
        expect(isChangedFromZero(row({}))).toBe(true);
        expect(isChangedFromZero(row({ has_data: undefined, has_prior_data: undefined }))).toBe(
            true,
        );
        expect(isChangedFromZero(row({ delta_pct: 0 }))).toBe(false);
        expect(isChangedFromZero(row({ delta_pct: 12 }))).toBe(false);
        expect(isChangedFromZero(row({ has_prior_data: false }))).toBe(false);
        expect(isChangedFromZero(row({ has_data: false }))).toBe(false);
        expect(isChangedFromZero(row({ value: 0 }))).toBe(false);
        expect(readDelta(row({}))).toEqual({ kind: "from-zero", value: 5 });
        expect(readDelta(row({ has_prior_data: false }))).toEqual({ kind: "no-prior" });
        expect(readDelta(row({ has_data: false }))).toEqual({ kind: "no-data" });
        // today's wire: a 0 on a side with no data is a placeholder, never a measured 0%
        expect(readDelta(row({ delta_pct: 0, has_data: false }))).toEqual({ kind: "no-data" });
        expect(readDelta(row({ delta_pct: 0, has_prior_data: false }))).toEqual({
            kind: "no-prior",
        });
        expect(readDelta(row({ delta_pct: 0 }))).toEqual({ kind: "percent", percent: 0 });
        expect(readDelta(row({ rate_state: "unknown_no_incident_evidence" }))).toEqual({
            kind: "no-data",
        });
    });

    it("words the absolute change with 'from 0' and no percent sign", () => {
        expect(changedFromZeroLabel(12, "")).toBe("+12 from 0");
        expect(changedFromZeroLabel(5, "loc")).toBe("+5 LOC from 0");
        expect(changedFromZeroLabel(-3, "days")).toBe("-3 days from 0");
        expect(changedFromZeroLabel(5, "%")).toBe("+5 pts from 0");
        expect(changedFromZeroLabel(5, "%")).not.toContain("%");
    });

    it("takes glyph and tone from the sign and the polarity", () => {
        expect(changedFromZeroParts(5, "loc", { inverseGood: true })).toMatchObject({
            glyph: "↑",
            polarity: "bad",
        });
        expect(changedFromZeroParts(5, "loc", { inverseGood: false })).toMatchObject({
            glyph: "↑",
            polarity: "good",
        });
        expect(changedFromZeroParts(-5, "loc", { inverseGood: true })).toMatchObject({
            glyph: "↓",
            polarity: "good",
        });
        expect(changedFromZeroParts(null, "loc")).toBeNull();
        expect(changedFromZeroParts(0, "loc")).toBeNull();
    });

    it("MetricDelta: state 3 reads the change, a served 0 and no prior row do not", () => {
        const { container, rerender } = render(
            <MetricDelta value={null} changedFromZero={{ current: 12, unit: "" }} />,
        );
        expect(container).toHaveTextContent("↑ +12 from 0");
        expect(container).not.toHaveTextContent(NEVER);
        rerender(<MetricDelta value={0} />);
        expect(container).toHaveTextContent("0%");
        rerender(<MetricDelta value={null} />);
        expect(container).toHaveTextContent("No prior period");
    });
});

describe("metric tile", () => {
    const tile = (r: Row, inverseGood = false) =>
        render(<MetricCard label="x" inverseGood={inverseGood} {...metricCardProps(r)} />)
            .container;

    it("number: as today", () => {
        expect(tile(row({ delta_pct: 12 }))).toHaveTextContent("+12%");
    });
    it("served 0 with both sides measured: 0%", () => {
        expect(tile(row({ delta_pct: 0 }))).toHaveTextContent("0%");
    });
    it("no prior: No prior period", () => {
        expect(tile(row({ delta_pct: null, has_prior_data: false }))).toHaveTextContent(
            "No prior period",
        );
        expect(tile(row({ delta_pct: 0, has_prior_data: false }))).toHaveTextContent(
            "No prior period",
        );
    });
    it("state 3 positive and negative", () => {
        const up = tile(row({ value: 5 }));
        expect(up.querySelector('[data-testid="metric-delta"]')).toHaveTextContent("+5 LOC from 0");
        expect(up.querySelector('[data-testid="metric-delta"]')?.textContent).not.toMatch(NEVER);
        const down = tile(row({ value: -2, unit: "days" }));
        expect(down.querySelector('[data-testid="metric-delta"]')).toHaveTextContent(
            "-2 days from 0",
        );
    });
    it("state 3, flags absent: still from zero", () => {
        const c = tile(row({ has_data: undefined, has_prior_data: undefined }));
        expect(c).toHaveTextContent("+5 LOC from 0");
    });
    it("state 3 tone: lower-is-better increase is negative", () => {
        const c = tile(row({ value: 5 }), true);
        expect(c.querySelector('[data-testid="metric-delta"]')?.className).toContain(
            "accent-negative",
        );
    });
});

describe("person tile", () => {
    it("state 3 reads from zero; no prior and a number are as today", () => {
        const { container, rerender } = render(
            <NeutralDelta value={null} changedFromZero={{ current: 4, unit: "loc" }} />,
        );
        expect(container).toHaveTextContent("↑+4 LOC from 0");
        rerender(<NeutralDelta value={null} />);
        expect(container).toHaveTextContent("No prior period");
        rerender(<NeutralDelta value={0} />);
        expect(container).toHaveTextContent("→0%");
        rerender(<NeutralDelta value={9} />);
        expect(container).toHaveTextContent("↑+9%");
    });
});

describe("association rows", () => {
    const drv = (over: Partial<Contributor>): Contributor => ({
        id: "d",
        label: "d",
        value: 7,
        delta_pct: null,
        evidence_link: "",
        ...over,
    });
    it("state 3 row says the change, fills the track, and is not Not reported", () => {
        const [a, b] = associationMeterRows([drv({}), drv({ id: "e", delta_pct: 40 })], undefined, {
            signed: true,
            unit: "loc",
        });
        expect(a.display).toBe("+7 LOC from 0");
        expect(a.value).toBe(100);
        expect(b.display).toBe("+40%");
    });
    it("a served 0 is 0%, and a null percent without prior data says no prior period", () => {
        const [z, n] = associationMeterRows(
            [drv({ delta_pct: 0 }), drv({ id: "n", has_prior_data: false })],
            undefined,
            { signed: true },
        );
        expect(z.display).toBe("0%");
        expect(n.display).toBe("No prior period");
        expect(n.value).toBe(0);
    });
});

describe("read the signal", () => {
    it("state 3 says up/down with the change, never unavailable or 0%", () => {
        render(<ReadTheSignal label="L" value={5} unit="loc" deltaPct={null} />);
        expect(screen.getByTestId("signal-headline")).toHaveTextContent("L appears up");
        expect(screen.getByTestId("signal-numbers")).toHaveTextContent("+5 LOC from 0");
    });
    it("no prior stays unavailable", () => {
        render(
            <ReadTheSignal label="L" value={5} unit="loc" deltaPct={null} hasPriorData={false} />,
        );
        expect(screen.getByTestId("signal-headline")).toHaveTextContent("change unavailable");
    });
});

describe("sort by change magnitude", () => {
    const m = (metric: string, p: number | null, over: Partial<Row> = {}) =>
        row({ metric, delta_pct: p, ...over });
    it("a state-3 row outranks every percent; two rank by |change|; no-prior ranks as no change", () => {
        const out = sortDeltasByRole(
            [
                m("b", 3),
                m("z", null, { has_prior_data: false }),
                m("c", 10),
                m("s", null, { value: 5 }),
                m("t", null, { value: -9 }),
            ],
            "engineer",
        ).map((d) => d.metric);
        expect(out.slice(0, 2)).toEqual(["t", "s"]);
        expect(out.indexOf("c")).toBeLessThan(out.indexOf("b"));
        expect(out.indexOf("b")).toBeLessThan(out.indexOf("z"));
    });
});

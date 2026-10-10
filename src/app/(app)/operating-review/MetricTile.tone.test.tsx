/**
 * CHAOS-9077: the Operating Review tile draws its own change (a deltaSlot and a status chip), so
 * the shared polarity tone must not reach it: no `metric-delta` element, and the status chip keeps
 * its own served-status tint, whatever the metric's polarity.
 */
import { afterEach, describe, expect, it } from "vitest";

import { cleanup, render, screen } from "@/test/utils";
import type { OperatingReviewMetric } from "@/lib/graphql/types";

import { MetricTile, TINT } from "./MetricTile";

afterEach(cleanup);

const metric = (key: string, absolute: number, status: string): OperatingReviewMetric =>
    ({
        key,
        label: key,
        value: 15,
        unit: "items",
        hasData: true,
        delta: {
            value: 15,
            priorValue: 15 - absolute,
            absolute,
            percent: absolute * 5,
            status,
            hasPriorData: true,
        },
    }) as OperatingReviewMetric;

describe("Operating Review tile change tone", () => {
    it.each([
        ["cycle_time", 6, "worsened", TINT.worsened],
        ["cycle_time", -6, "improved", TINT.improved],
        ["throughput", 6, "improved", TINT.improved],
        ["throughput", -6, "worsened", TINT.worsened],
    ])("%s change %i is the served status %s, in its own tint", (key, absolute, status, tint) => {
        render(<MetricTile metric={metric(key, absolute, status)} narrow={false} />);
        const tile = screen.getByTestId("operating-review-metric");
        expect(screen.queryByTestId("metric-delta")).toBeNull();
        const chip = screen.getByTestId("operating-review-metric-status");
        for (const cls of tint.split(" ")) expect(chip.className).toContain(cls);
        // The change text itself carries no tone class.
        expect(tile.innerHTML).not.toContain("text-(--accent-negative)");
    });
});

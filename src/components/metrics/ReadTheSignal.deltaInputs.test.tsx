import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
    DELTA_INPUTS,
    FROM_ZERO_TEXT,
    NO_DATA_TEXT,
} from "@/lib/metrics/__tests__/deltaInputs.fixtures";

import { ReadTheSignal } from "./ReadTheSignal";

afterEach(cleanup);

// CHAOS-9110: "Read the signal" for each of the four served inputs.
describe("Read the signal reads the no-data flags", () => {
    for (const input of DELTA_INPUTS) {
        it(input.name, () => {
            render(
                <ReadTheSignal
                    label="Churn LOC"
                    value={input.value}
                    unit="loc"
                    deltaPct={input.delta_pct}
                    hasData={input.has_data}
                    hasPriorData={input.has_prior_data}
                />,
            );
            const headline = screen.getByTestId("signal-headline").textContent ?? "";
            const numbers = screen.getByTestId("signal-numbers").textContent ?? "";
            const all = `${headline} ${numbers}`;
            expect(all).not.toMatch(/unchanged|0%|NaN|null/);
            if (input.state === "from-zero") {
                expect(headline).toContain("appears up");
                expect(numbers).toMatch(FROM_ZERO_TEXT);
            } else if (input.state === "no-data") {
                // A no-data window has no value: the 0 placeholder is never drawn as a value.
                expect(headline).toContain("Churn LOC");
                expect(numbers).toContain(NO_DATA_TEXT);
                expect(numbers).not.toMatch(/shows 0/);
            } else {
                expect(headline).toContain("change unavailable");
                expect(numbers).toContain("unavailable");
                expect(numbers).not.toContain("from 0");
            }
        });
    }
});

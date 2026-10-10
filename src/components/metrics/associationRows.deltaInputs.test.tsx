import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MeterRows } from "@/components/ui/MeterRows";
import {
    DELTA_INPUTS,
    FROM_ZERO_TEXT,
    NO_DATA_TEXT,
    NO_PRIOR_TEXT,
} from "@/lib/metrics/__tests__/deltaInputs.fixtures";

import { associationMeterRows } from "./associationRows";

afterEach(() => document.body.replaceChildren());

// CHAOS-9110: the "Likely associations" row text for each of the four served inputs.
describe("association rows read the no-data flags", () => {
    for (const signed of [true, false]) {
        for (const input of DELTA_INPUTS) {
            it(`${signed ? "signed" : "unsigned"} ${input.name}`, () => {
                const rows = associationMeterRows(
                    [
                        {
                            id: "r1",
                            label: "repo-one",
                            display_name: "repo-one",
                            evidence_link: "/e",
                            value: input.value,
                            delta_pct: input.delta_pct,
                            has_data: input.has_data,
                            has_prior_data: input.has_prior_data,
                        },
                    ],
                    undefined,
                    { signed, unit: "loc" },
                );
                render(<MeterRows rows={rows} signed={signed} />);
                const text = screen.getByTestId("meter-row").textContent ?? "";
                expect(text).not.toContain("Not reported");
                expect(text).not.toMatch(/(^|[^.\d])0%|NaN|null/);
                if (input.state === "from-zero") expect(text).toMatch(FROM_ZERO_TEXT);
                else {
                    expect(text).not.toContain("from 0");
                    expect(text).toContain(
                        input.state === "no-data" ? NO_DATA_TEXT : NO_PRIOR_TEXT,
                    );
                }
            });
        }
    }
});

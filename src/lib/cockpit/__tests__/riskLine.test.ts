import { describe, expect, it } from "vitest";

import { riskSignalsLine } from "../riskLine";

const risk = (current_value: string, confidence: "high" | "medium" | "low" = "low") => ({
    metric: "compounding_risk",
    current_value,
    confidence,
});
const metric = { metric: "churn", current_value: "1,320,441 LOC", confidence: "high" as const };

describe("riskSignalsLine", () => {
    it("names the served risk values as served, with the shared served confidence word", () => {
        expect(riskSignalsLine([risk("58%"), risk("53.8%"), risk("51.9%")])).toBe(
            "Risk signals: 58%, 53.8%, and 51.9%, each with low confidence.",
        );
    });

    it("keeps a served value string unchanged, a space before the unit included", () => {
        expect(riskSignalsLine([risk("63.9 %"), risk("50.0 %")])).toBe(
            "Risk signals: 63.9 % and 50.0 %, each with low confidence.",
        );
    });

    it("uses the singular for one served risk signal", () => {
        expect(riskSignalsLine([risk("63.9 %", "medium")])).toBe(
            "Risk signal: 63.9 %, with medium confidence.",
        );
    });

    it("names three values at most, then the count of the other served risk signals", () => {
        expect(
            riskSignalsLine([risk("63.9 %"), risk("63.9 %"), risk("50.0 %"), risk("50.0 %")]),
        ).toBe("Risk signals: 63.9 %, 63.9 %, 50.0 %, and 1 more, each with low confidence.");
        expect(
            riskSignalsLine([risk("9 %"), risk("8 %"), risk("7 %"), risk("6 %"), risk("5 %")]),
        ).toBe("Risk signals: 9 %, 8 %, 7 %, and 2 more, each with low confidence.");
    });

    it("says the confidence per value when the served confidence differs", () => {
        expect(riskSignalsLine([risk("63.9 %", "low"), risk("50.0 %", "medium")])).toBe(
            "Risk signals: 63.9 % (low confidence) and 50.0 % (medium confidence).",
        );
    });

    it("does not say 'each with' when a signal behind 'and N more' has another confidence", () => {
        expect(riskSignalsLine([risk("9 %"), risk("8 %"), risk("7 %"), risk("6 %", "high")])).toBe(
            "Risk signals: 9 % (low confidence), 8 % (low confidence), 7 % (low confidence), and 1 more.",
        );
    });

    it("reads only risk signals, in the served order, and ignores the other kinds", () => {
        expect(riskSignalsLine([metric, risk("50.0 %"), metric, risk("63.9 %")])).toBe(
            "Risk signals: 50.0 % and 63.9 %, each with low confidence.",
        );
    });

    it("gives no line when the API served no risk signal", () => {
        expect(riskSignalsLine([metric])).toBeNull();
        expect(riskSignalsLine([])).toBeNull();
        expect(riskSignalsLine(null)).toBeNull();
        expect(riskSignalsLine(undefined)).toBeNull();
    });
});

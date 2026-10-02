import { describe, expect, it } from "vitest";

import { associationMeterRows, contributorMeterRows, signedPercent } from "./associationRows";

const row = (id: string, label: string, value: number, delta_pct: number) => ({
    id,
    label,
    value,
    delta_pct,
    evidence_link: "",
});

describe("signedPercent", () => {
    it("keeps the served sign and one decimal; a zero change has no sign", () => {
        expect(signedPercent(12.34)).toBe("+12.3%");
        expect(signedPercent(-20)).toBe("-20%");
        expect(signedPercent(0)).toBe("0%");
        expect(signedPercent(0.3)).toBe("+0.3%");
    });
});

describe("associationMeterRows", () => {
    it("fills by |delta| and shows the signed served change; labels come from the resolver when given", () => {
        const rows = associationMeterRows([row("a", "raw-a", 3, -20), row("b", "raw-b", 2, 10)], {
            labels: ["repo-a", "repo-b"],
            titles: ["Full A", "Full B"],
        });
        expect(rows).toEqual([
            { key: "a", label: "repo-a", title: "Full A", value: 20, display: "-20%" },
            { key: "b", label: "repo-b", title: "Full B", value: 10, display: "+10%" },
        ]);
    });

    it("falls back to the served label without a resolver", () => {
        expect(associationMeterRows([row("a", "raw-a", 3, 5)])[0].label).toBe("raw-a");
    });
});

describe("contributorMeterRows", () => {
    it("shows the served value with the served unit; no unit, no added format", () => {
        expect(contributorMeterRows([row("c", "repo-c", 7, 1)], "days")[0]).toMatchObject({
            value: 7,
            display: "7d",
        });
        expect(contributorMeterRows([row("c", "repo-c", 7, 1)], undefined)[0].display).toBe(
            undefined,
        );
    });
});

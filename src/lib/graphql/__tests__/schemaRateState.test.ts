import { readFileSync } from "node:fs";
import path from "node:path";

import { buildSchema, isObjectType } from "graphql";
import { describe, expect, it } from "vitest";

import type { MetricDelta, OperatingReviewMetric } from "../__generated__/types";

// CHAOS-9061: the schema copy carries the nullable `rateState` string the ops contract pin serves.
describe("schema copy rateState (CHAOS-9061)", () => {
    const schema = buildSchema(readFileSync(path.join(__dirname, "../schema.graphql"), "utf8"));

    it.each(["MetricDelta", "OperatingReviewMetric"])(
        "%s serves a nullable String rateState",
        (name) => {
            const type = schema.getType(name);
            expect(type && isObjectType(type)).toBe(true);
            const def = isObjectType(type!) ? type.getFields()["rateState"] : undefined;
            expect(def?.type.toString()).toBe("String");
        },
    );

    it("generated types accept rateState as optional", () => {
        const rows: [Partial<MetricDelta>, Partial<OperatingReviewMetric>] = [
            { rateState: null },
            { rateState: "measured" },
        ];
        expect(rows.map((row) => row.rateState)).toEqual([null, "measured"]);
    });
});

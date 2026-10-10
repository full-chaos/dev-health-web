import { readFileSync } from "node:fs";
import path from "node:path";

import { buildSchema, isObjectType } from "graphql";
import { describe, expect, it } from "vitest";

import type { MetricDelta } from "../__generated__/types";

// CHAOS-9095: the schema copy carries the nullable `deltaPct` the ops contract pin serves.
describe("schema copy deltaPct (CHAOS-9095)", () => {
    const schema = buildSchema(readFileSync(path.join(__dirname, "../schema.graphql"), "utf8"));

    it("MetricDelta serves a nullable Float deltaPct", () => {
        const type = schema.getType("MetricDelta");
        expect(type && isObjectType(type)).toBe(true);
        const def = isObjectType(type!) ? type.getFields()["deltaPct"] : undefined;
        expect(def?.type.toString()).toBe("Float");
    });

    it("generated types accept a null deltaPct", () => {
        const row: Pick<MetricDelta, "deltaPct"> = { deltaPct: null };
        expect(row.deltaPct).toBeNull();
    });
});

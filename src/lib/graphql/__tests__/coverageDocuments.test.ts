import { readFileSync } from "node:fs";
import path from "node:path";

import { buildSchema, isObjectType } from "graphql";
import { describe, expect, it } from "vitest";

import { sha256Trim, wireForm } from "../../../../scripts/graphql-wire-parity";
import { COMPOUNDING_RISK_QUERY, HOME_QUERY } from "../queries";

const fixture = (name: string): string =>
    readFileSync(path.join(__dirname, "fixtures/wire", name), "utf8");

// CHAOS-9078: the backend accepts a document only when sha256(trim(text)) is a registered text.
// The fixtures are the registered texts, copied byte for byte from the backend wire capture.
describe("registered document texts", () => {
    it("Home wire text equals the captured text", () => {
        expect(wireForm(HOME_QUERY).trim()).toBe(fixture("home_captured.graphql").trim());
        expect(sha256Trim(wireForm(HOME_QUERY))).toBe(
            "b42f3f95a8621cb7db6793b73b657144ce8681aff265767fa9d24d01ffc1fb4d",
        );
    });

    it("compounding risk wire text equals the captured text", () => {
        expect(wireForm(COMPOUNDING_RISK_QUERY).trim()).toBe(
            fixture("compoundingrisk_captured.graphql").trim(),
        );
        expect(sha256Trim(wireForm(COMPOUNDING_RISK_QUERY))).toBe(
            "6bb6a6de9cc77faa27f47c2646436f67cfbd0558f3deded569e44f77689bc460",
        );
    });
});

describe("schema copy coverage and repoFilterApplied (CHAOS-9078)", () => {
    const schema = buildSchema(readFileSync(path.join(__dirname, "../schema.graphql"), "utf8"));
    const typeOf = (type: string, field: string): string | undefined => {
        const t = schema.getType(type);
        return t && isObjectType(t) ? t.getFields()[field]?.type.toString() : undefined;
    };

    it.each([
        ["CompoundingRiskPoint", "coverage"],
        ["HomeSignal", "coverage"],
        ["MetricDelta", "repoFilterApplied"],
        ["HomeSignal", "repoFilterApplied"],
    ])("%s.%s is served and nullable", (type, field) => {
        expect(typeOf(type, field)).toBe(field === "coverage" ? "Float" : "Boolean");
    });
});

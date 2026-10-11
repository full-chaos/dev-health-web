import { describe, expect, it } from "vitest";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { lockScopeForView } from "../lockScope";

describe("lockScopeForView", () => {
    it("keeps a filter that is on the locked level", () => {
        const filters = { ...defaultMetricFilter, scope: { level: "team" as const, ids: ["a"] } };
        expect(lockScopeForView(filters, "investment")).toBe(filters);
    });
    it("moves another level to the lock and drops its ids", () => {
        const filters = { ...defaultMetricFilter, scope: { level: "org" as const, ids: ["x"] } };
        expect(lockScopeForView(filters, "investment")).toEqual({
            ...filters,
            scope: { level: "team", ids: [] },
        });
    });
    it("leaves a view with no lock alone", () => {
        const filters = { ...defaultMetricFilter, scope: { level: "org" as const, ids: [] } };
        expect(lockScopeForView(filters, "dashboard" as never)).toBe(filters);
    });
});

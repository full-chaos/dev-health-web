import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ONBOARDING_EVENTS } from "@/lib/onboarding/events";

import { ROUTE_TEMPLATES } from "../routePatterns";
import { boundTelemetryString } from "../sanitize";

const TELEMETRY_DIR = path.resolve(__dirname, "..");

function quotedLiterals(file: string): string[] {
    const source = fs.readFileSync(file, "utf8");
    return [...source.matchAll(/"([^"\\\n]*)"/g)].map((match) => match[1]);
}

describe("every code-owned telemetry value is free of a colon", () => {
    it("holds for every route template", () => {
        for (const template of ROUTE_TEMPLATES) {
            expect(template).not.toContain(":");
            expect(boundTelemetryString(template)).toBe(template);
        }
    });

    it("holds for every string literal of the event types", () => {
        const literals = quotedLiterals(path.join(TELEMETRY_DIR, "types.ts"));
        expect(literals.length).toBeGreaterThan(20);
        for (const literal of literals) {
            expect(literal).not.toContain(":");
            expect(literal).not.toContain("//");
        }
    });

    it("holds for the onboarding funnel event names", () => {
        for (const name of ONBOARDING_EVENTS) {
            expect(name).not.toContain(":");
        }
    });

    it("holds for the literal values the emitters and call sites pass", () => {
        const sources = [
            path.join(TELEMETRY_DIR, "emitters.ts"),
            path.resolve(TELEMETRY_DIR, "../../components/telemetry/TelemetryProvider.tsx"),
            path.resolve(TELEMETRY_DIR, "../../components/charts/QuadrantPanel.tsx"),
            path.resolve(TELEMETRY_DIR, "../../components/filters/useFilterBarState.ts"),
        ];
        const emitted = [
            "route",
            "home",
            "unknown",
            "quadrant",
            "quadrant_panel",
            "overlay_toggled",
            "overlay_ignored",
        ];
        for (const value of emitted) {
            expect(boundTelemetryString(value)).toBe(value);
        }
        const joined = sources.map((file) => fs.readFileSync(file, "utf8")).join("\n");
        for (const value of emitted) {
            expect(joined).toContain(`"${value}"`);
        }
    });
});

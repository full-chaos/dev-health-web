import { describe, expect, it } from "vitest";

import { isAskDevEnabled, isAskDevExcludedPath } from "../surface";

describe("isAskDevExcludedPath", () => {
    it.each([
        "/",
        "/auth/signin",
        "/auth/onboard",
        "/marketing",
        "/marketing/about",
        "/pricing",
        "/privacy",
        "/terms",
        "/superadmin/context-fabric/validation",
        "/agent-context",
        "/agent-context/context-packet",
    ])("excludes %s", (path) => {
        expect(isAskDevExcludedPath(path)).toBe(true);
    });

    it.each([
        "/dashboard",
        "/investment",
        "/diagnose",
        "/superadmin/licensing",
        "/superadmin/context-fabric",
        "/authors",
        "/agent-contexts",
        "/pricing-guide",
    ])("keeps %s", (path) => {
        expect(isAskDevExcludedPath(path)).toBe(false);
    });
});

describe("isAskDevEnabled", () => {
    it("needs both entitlements", () => {
        expect(isAskDevEnabled({ ask_dev: true, agent_context_runtime: true })).toBe(true);
        expect(isAskDevEnabled({ ask_dev: true, agent_context_runtime: false })).toBe(false);
        expect(isAskDevEnabled({ ask_dev: false, agent_context_runtime: true })).toBe(false);
        expect(isAskDevEnabled({ ask_dev: true })).toBe(false);
        expect(isAskDevEnabled({ agent_context_runtime: true })).toBe(false);
        expect(isAskDevEnabled({})).toBe(false);
    });
});

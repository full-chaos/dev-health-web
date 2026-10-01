import { describe, expect, it } from "vitest";

import { SHELL_ROUTES, isShellRoute, shellRouteForPathname } from "./shellRoutes";

describe("shell route registry", () => {
    it("registers the Cockpit and the migrated Diagnose, Govern, Plan and Improve routes", () => {
        expect(SHELL_ROUTES.map((route) => route.prefix)).toEqual([
            "/dashboard",
            "/diagnose",
            "/diagnose/work-graph",
            "/metrics",
            "/explore",
            "/investment",
            "/landscape",
            "/code",
            "/complexity",
            "/bottleneck",
            "/cognitive-load",
            "/people",
            "/govern",
            "/quality",
            "/testops",
            "/incident-correlation",
            "/risk/compounding",
            "/security",
            "/feature-flags",
            "/plan",
            "/plan/capacity",
            "/plan/backlog-risk",
            "/operating-review",
            "/improve",
            "/opportunities",
            "/improve/experiments",
            "/improve/automations",
        ]);
    });

    it("matches an exact route only on its own path", () => {
        const routes = [{ prefix: "/diagnose", exact: true }];
        expect(isShellRoute("/diagnose", routes)).toBe(true);
        expect(isShellRoute("/diagnose/work-graph", routes)).toBe(false);
        expect(isShellRoute("/diagnoses", routes)).toBe(false);
    });

    it("matches a registered prefix and its descendants", () => {
        expect(isShellRoute("/dashboard")).toBe(true);
        expect(isShellRoute("/dashboard/anything")).toBe(true);
    });

    it("does not match a path that only starts with the same characters", () => {
        expect(isShellRoute("/dashboards")).toBe(false);
        expect(isShellRoute("/dashboard-old")).toBe(false);
    });

    it.each(["/capacity", "/reports", "/org/admin", "/superadmin", "/settings", "/ai/impact", "/"])(
        "keeps %s outside the shell",
        (pathname) => {
            expect(isShellRoute(pathname)).toBe(false);
        },
    );

    it("treats a missing pathname as outside the shell", () => {
        expect(isShellRoute(null)).toBe(false);
        expect(isShellRoute(undefined)).toBe(false);
        expect(isShellRoute("")).toBe(false);
    });

    it("selects the longest matching prefix", () => {
        const routes = [{ prefix: "/plan" }, { prefix: "/plan/capacity", defaultRole: true }];
        expect(shellRouteForPathname("/plan/capacity/x", routes)).toEqual({
            prefix: "/plan/capacity",
            defaultRole: true,
        });
        expect(shellRouteForPathname("/plan/backlog-risk", routes)).toEqual({ prefix: "/plan" });
    });

    it("keeps the Cockpit's default role injection", () => {
        expect(shellRouteForPathname("/dashboard")?.defaultRole).toBe(true);
    });
});

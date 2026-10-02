import { describe, expect, it } from "vitest";

import { SHELL_ROUTES, shellRouteForPathname } from "./shellRoutes";

describe("shell route registry", () => {
    it("registers the Home and the migrated Diagnose, Govern, Plan, Improve, AI, Reports and Admin routes", () => {
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
            "/ai",
            "/ai/impact",
            "/ai/impact/evidence",
            "/ai/review-load",
            "/ai/automations",
            "/ai/risk",
            "/ai/attribution",
            "/prs",
            "/issues",
            "/deployments",
            "/reports",
            "/reports",
            "/org/admin",
            "/data-health",
            "/settings",
            "/superadmin",
            "/demo",
        ]);
    });

    it("matches an exact route only on its own path", () => {
        const routes = [{ prefix: "/diagnose", exact: true }];
        expect(shellRouteForPathname("/diagnose", routes)).toBeDefined();
        expect(shellRouteForPathname("/diagnose/work-graph", routes)).toBeUndefined();
        expect(shellRouteForPathname("/diagnoses", routes)).toBeUndefined();
    });

    it("matches a registered prefix and its descendants", () => {
        expect(shellRouteForPathname("/dashboard")).toBeDefined();
        expect(shellRouteForPathname("/dashboard/anything")).toBeDefined();
    });

    it("does not match a path that only starts with the same characters", () => {
        expect(shellRouteForPathname("/dashboards")).toBeUndefined();
        expect(shellRouteForPathname("/dashboard-old")).toBeUndefined();
    });

    it.each(["/superadmins", "/settingsx", "/demox", "/"])(
        "has no registry entry for %s",
        (pathname) => {
            expect(shellRouteForPathname(pathname)).toBeUndefined();
        },
    );

    it("puts the Admin pages in the shell with no filter state (CHAOS-7591)", () => {
        for (const pathname of [
            "/org/admin",
            "/org/admin/users/new",
            "/org/admin/sync/c1",
            "/data-health",
            "/data-health/identity",
            "/settings",
            "/superadmin",
            "/superadmin/billing/plans",
        ]) {
            expect(shellRouteForPathname(pathname), pathname).toBeDefined();
            expect(shellRouteForPathname(pathname)?.filterParam, pathname).toBe("none");
        }
        expect(shellRouteForPathname("/org/administration")).toBeUndefined();
    });

    it("treats a missing pathname as outside the shell", () => {
        expect(shellRouteForPathname(null)).toBeUndefined();
        expect(shellRouteForPathname(undefined)).toBeUndefined();
        expect(shellRouteForPathname("")).toBeUndefined();
    });

    it("selects the longest matching prefix", () => {
        const routes = [{ prefix: "/plan" }, { prefix: "/plan/capacity", defaultRole: true }];
        expect(shellRouteForPathname("/plan/capacity/x", routes)).toEqual({
            prefix: "/plan/capacity",
            defaultRole: true,
        });
        expect(shellRouteForPathname("/plan/backlog-risk", routes)).toEqual({ prefix: "/plan" });
    });

    it("keeps the Home's default role injection", () => {
        expect(shellRouteForPathname("/dashboard")?.defaultRole).toBe(true);
    });

    it("marks the Security routes as routes with their own `f` encoding, and no other route", () => {
        expect(shellRouteForPathname("/security")?.filterParam).toBe("page");
        expect(shellRouteForPathname("/security/repos/repo-1")?.filterParam).toBe("page");
        expect(
            SHELL_ROUTES.filter((route) => route.filterParam === "page").map(
                (route) => route.prefix,
            ),
        ).toEqual(["/security"]);
    });

    it("marks the artifact detail, report and admin routes as routes with no filter state, and no other route", () => {
        expect(shellRouteForPathname("/prs/repo-1:42")?.filterParam).toBe("none");
        expect(
            SHELL_ROUTES.filter((route) => route.filterParam === "none").map(
                (route) => route.prefix,
            ),
        ).toEqual([
            "/prs",
            "/issues",
            "/deployments",
            "/reports",
            "/org/admin",
            "/data-health",
            "/settings",
            "/superadmin",
            "/demo",
        ]);
    });

    it("gives Report Center its own entry and its descendants the no-filter entry: the first equal-length match wins", () => {
        expect(shellRouteForPathname("/reports")).toEqual({ prefix: "/reports", exact: true });
        expect(shellRouteForPathname("/reports/new")?.filterParam).toBe("none");
        expect(shellRouteForPathname("/reports/abc-123")?.filterParam).toBe("none");
    });
});

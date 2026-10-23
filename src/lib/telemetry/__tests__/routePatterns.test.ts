import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { routePatternForPathname } from "../routePatterns";

describe("routePatternForPathname", () => {
    it("removes query strings and hashes", () => {
        expect(routePatternForPathname("/metrics?tab=dora#section")).toBe("/metrics");
    });

    it("normalizes dynamic identifiers", () => {
        expect(routePatternForPathname("/people/abc-123/metrics/cycle-time")).toBe(
            "/people/[person_id]/metrics/[metric]",
        );
        expect(routePatternForPathname("/reports/550e8400-e29b-41d4-a716-446655440000")).toBe(
            "/reports/[id]",
        );
    });
});

describe("routePatternForPathname bounded labels", () => {
    const APP_ROOT = path.resolve(__dirname, "../../../app");
    const SAMPLE_ID = "sample-id-84217x";

    function dynamicRoutes(dir: string, segments: string[] = []): string[][] {
        const found: string[][] = [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.name === "__tests__") continue;
            const isGroup = /^\(.+\)$/.test(entry.name);
            const next = isGroup ? segments : [...segments, entry.name];
            if (/^\[[^\]]+\]$/.test(entry.name) && !entry.name.startsWith("[...")) {
                found.push(next);
            }
            found.push(...dynamicRoutes(path.join(dir, entry.name), next));
        }
        return found.filter((segs) => /^\[[^\]]+\]$/.test(segs[segs.length - 1]));
    }

    const routes = dynamicRoutes(APP_ROOT);

    it("finds the dynamic route directories (count pinned)", () => {
        expect(routes.length).toBe(20);
    });

    it.each(routes.map((segs) => [segs.join("/"), segs] as const))(
        "maps /%s to a pattern that holds no sample id",
        (_name, segs) => {
            const pathname = `/${segs.map((s) => (s.startsWith("[") ? SAMPLE_ID : s)).join("/")}`;
            const pattern = routePatternForPathname(pathname);
            expect(pattern).not.toContain(SAMPLE_ID);
            expect(pattern.startsWith("/")).toBe(true);
        },
    );

    it("keeps a static sibling of a dynamic route unchanged", () => {
        expect(routePatternForPathname("/org/admin/users/new")).toBe("/org/admin/users/new");
        expect(routePatternForPathname("/superadmin/orgs/new")).toBe("/superadmin/orgs/new");
    });

    it("maps numeric and long hex segments to [id] on an unlisted route", () => {
        expect(routePatternForPathname("/thing/123456")).toBe("/thing/[id]");
        expect(routePatternForPathname("/thing/0123456789abcdef0123")).toBe("/thing/[id]");
    });
});

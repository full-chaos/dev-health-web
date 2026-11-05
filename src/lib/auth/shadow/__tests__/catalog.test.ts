import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { navAreas } from "@/lib/navigation/areas";
import { DATA_HEALTH_ROLES, ORG_ADMIN_ROLES, SURFACES, surfaceById } from "../catalog";

const appDir = path.resolve(__dirname, "../../../../app/(app)");
const read = (rel: string) => readFileSync(path.join(appDir, rel), "utf8");

describe("shadow catalog census", () => {
    const platformChildren = navAreas
        .flatMap((a) => a.children)
        .filter((c) => c.platformAdminOnly === true)
        .map((c) => `nav:${c.id}`)
        .sort();

    it("has a nav row for every platformAdminOnly child and no other nav row", () => {
        const rows = SURFACES.filter((s) => s.id.startsWith("nav:"))
            .map((s) => s.id)
            .sort();
        expect(platformChildren.length).toBeGreaterThan(0);
        expect(rows).toEqual(platformChildren);
    });

    it("computes a nav row verdict with the same function the sidebar uses", () => {
        const row = surfaceById("nav:platform");
        expect(
            row?.clientAllowed({ isPlatformAdmin: true, role: undefined, isImpersonating: false }),
        ).toBe(true);
        expect(
            row?.clientAllowed({ isPlatformAdmin: false, role: "owner", isImpersonating: false }),
        ).toBe(false);
    });

    it("has exactly one row per guard layout and the layouts name their role lists", () => {
        expect(SURFACES.filter((s) => s.id.startsWith("guard:")).map((s) => s.id)).toEqual([
            "guard:/org/admin",
            "guard:/superadmin",
            "guard:/data-health",
        ]);
        expect(read("org/admin/layout.tsx")).toContain(
            `requireRole(\n        [${ORG_ADMIN_ROLES.map((r) => `"${r}"`).join(", ")}]`,
        );
        expect(read("data-health/layout.tsx")).toContain(
            `requireRole([${DATA_HEALTH_ROLES.map((r) => `"${r}"`).join(", ")}]`,
        );
        expect(read("superadmin/layout.tsx")).toContain("requireSuperuser(");
    });

    it("asks the decision point only low-risk organization actions", () => {
        const asked = SURFACES.flatMap((s) => (s.request ? [s.request] : []));
        expect(asked).toEqual([{ action: "integrations.read", resource: "organization" }]);
        for (const a of asked) expect(a.action).toMatch(/\.read$/);
    });

    it("leaves the platform and operator rows unmapped (no low-risk action holds them)", () => {
        for (const id of [
            "nav:platform",
            "nav:platform-billing",
            "guard:/superadmin",
            "guard:/data-health",
        ]) {
            expect(surfaceById(id)?.request).toBeNull();
        }
    });

    it("mirrors the guards: superuser passes any role, an operator is not an org admin", () => {
        const orgAdmin = surfaceById("guard:/org/admin");
        expect(
            orgAdmin?.clientAllowed({
                isPlatformAdmin: false,
                role: "admin",
                isImpersonating: false,
            }),
        ).toBe(true);
        expect(
            orgAdmin?.clientAllowed({
                isPlatformAdmin: false,
                role: "operator",
                isImpersonating: false,
            }),
        ).toBe(false);
        expect(
            orgAdmin?.clientAllowed({
                isPlatformAdmin: true,
                role: undefined,
                isImpersonating: false,
            }),
        ).toBe(true);
        const health = surfaceById("guard:/data-health");
        expect(
            health?.clientAllowed({
                isPlatformAdmin: false,
                role: "operator",
                isImpersonating: false,
            }),
        ).toBe(true);
        expect(
            surfaceById("guard:/superadmin")?.clientAllowed({
                isPlatformAdmin: false,
                role: "owner",
                isImpersonating: false,
            }),
        ).toBe(false);
    });
});

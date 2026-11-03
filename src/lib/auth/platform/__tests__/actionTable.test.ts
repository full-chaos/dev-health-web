import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import catalog from "./testdata/ops-actions.v1.json";
import {
    IMPERSONATION_ALLOWED_PLATFORM_CONTROLS,
    ORG_IMPERSONATION_DENIED_ACTIONS,
    PLATFORM_ACTIONS,
    PLATFORM_ACTIONS_WITHOUT_WEB_SURFACE,
    PLATFORM_SURFACES,
} from "../actionTable";

const WEB_ROOT = join(__dirname, "..", "..", "..", "..", "..");
const OPS_ROOT = process.env.WIRE_PARITY_OPS_ROOT || process.env.WIRE_PARITY_OPS_MAIN_ROOT || "";

type CatalogAction = { action: string; scope: string; impersonation: string; risk_class: string };
const actions = catalog.actions as CatalogAction[];
const platform = actions.filter((a) => a.scope === "platform");
const orgDenied = actions.filter((a) => a.scope === "organization" && a.impersonation === "denied");

describe("C1 platform action table against the pinned catalog", () => {
    it("lists exactly the catalog's platform actions", () => {
        expect([...PLATFORM_ACTIONS].sort()).toEqual(platform.map((a) => a.action).sort());
    });

    it("every surface names a platform action, a catalog org action or the unmapped marker", () => {
        for (const row of PLATFORM_SURFACES) {
            expect(
                row.action === "unmapped" ||
                    (PLATFORM_ACTIONS as readonly string[]).includes(row.action) ||
                    actions.some((a) => a.scope === "organization" && a.action === row.action),
                row.id,
            ).toBe(true);
        }
    });

    it("every platform action has a surface or is listed as having none", () => {
        const used = new Set(PLATFORM_SURFACES.map((r) => r.action));
        for (const action of PLATFORM_ACTIONS) {
            expect(
                used.has(action) || PLATFORM_ACTIONS_WITHOUT_WEB_SURFACE.includes(action),
                action,
            ).toBe(true);
        }
        for (const action of PLATFORM_ACTIONS_WITHOUT_WEB_SURFACE) {
            expect(used.has(action), action).toBe(false);
        }
    });

    it("surface ids are unique and every surface names a real file and symbol", () => {
        const ids = PLATFORM_SURFACES.map((r) => r.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const row of PLATFORM_SURFACES) {
            const path = join(WEB_ROOT, row.file);
            expect(existsSync(path), `${row.id}: ${row.file}`).toBe(true);
            if (row.symbol) {
                expect(readFileSync(path, "utf8"), `${row.id}: ${row.symbol}`).toContain(
                    row.symbol,
                );
            }
        }
    });

    it("maps /superadmin/settings to the org settings actions and adds no admin.settings action", () => {
        const rows = PLATFORM_SURFACES.filter(
            (r) =>
                r.file.endsWith("/superadmin/settings/page.tsx") ||
                r.symbol === "listSettings" ||
                r.symbol === "listSettingCategories",
        );
        expect(rows.map((r) => r.action).sort()).toEqual([
            "settings.read",
            "settings.read",
            "settings.write",
        ]);
        for (const r of rows) expect(r.impersonation, r.id).toBe("denied");
        expect(actions.some((a) => a.action === "admin.settings")).toBe(false);
        expect((PLATFORM_ACTIONS as readonly string[]).includes("admin.settings")).toBe(false);
    });

    it("holds the surfaces that have no server mapping or no catalog action as flagged rows", () => {
        const byId = new Map(PLATFORM_SURFACES.map((r) => [r.id, r]));
        expect(byId.get("page:/superadmin/settings")?.action).toBe("settings.write");
        expect(byId.get("fn:listSettingCategories")?.action).toBe("settings.read");
        expect(byId.get("fn:listSettings")?.action).toBe("settings.read");
        for (const id of ["page:/superadmin/users", "fn:createServiceAccount"]) {
            expect(byId.get(id)?.action, id).toBe("admin.users");
            expect(byId.get(id)?.serverMapped, id).toBe(false);
        }
        expect(byId.get("page:/superadmin/audit")?.action).toBe("admin.audit");
        expect(byId.get("page:/superadmin/billing/audit")?.action).toBe("admin.audit");
    });
});

describe("C2 impersonation rule table against the pinned catalog", () => {
    it("every platform action is denied while impersonating in the catalog", () => {
        for (const a of platform) {
            expect(a.impersonation, a.action).toBe("denied");
            expect(a.risk_class, a.action).toBe("high");
        }
    });

    it("lists exactly the organization actions the catalog denies while impersonating", () => {
        expect([...ORG_IMPERSONATION_DENIED_ACTIONS].sort()).toEqual(
            orgDenied.map((a) => a.action).sort(),
        );
    });

    it("keeps stop impersonation and the status read as the only allowed platform controls", () => {
        expect(IMPERSONATION_ALLOWED_PLATFORM_CONTROLS).toEqual([
            "stopImpersonation",
            "getImpersonationStatus",
        ]);
        const impersonationDenied = new Set(
            PLATFORM_SURFACES.filter((r) => r.impersonation === "allowed").map((r) => r.symbol),
        );
        expect([...impersonationDenied].sort()).toEqual(
            [...IMPERSONATION_ALLOWED_PLATFORM_CONTROLS].sort(),
        );
    });

    it("denies every other platform surface while impersonating", () => {
        for (const row of PLATFORM_SURFACES) {
            if (IMPERSONATION_ALLOWED_PLATFORM_CONTROLS.includes(row.symbol ?? "")) continue;
            expect(row.impersonation, row.id).toBe("denied");
        }
    });
});

describe.runIf(OPS_ROOT !== "")("pinned catalog snapshot matches the ops checkout", () => {
    it("holds the same catalog as contracts/auth/v1/vocabulary/actions.v1.json", () => {
        const live = JSON.parse(
            readFileSync(join(OPS_ROOT, "contracts/auth/v1/vocabulary/actions.v1.json"), "utf8"),
        );
        expect(catalog).toEqual(live);
    });
});

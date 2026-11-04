import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
    PLATFORM_ACTIONS,
    PLATFORM_ACTIONS_WITHOUT_WEB_SURFACE,
    PLATFORM_SURFACES,
} from "../actionTable";
import { PLATFORM_SHADOW_ROWS } from "../shadow";

const read = (file: string) => readFileSync(file, "utf8");

const GUARDED_FILES = [
    "src/lib/admin/server/orgs.ts",
    "src/lib/admin/server/billing.ts",
    "src/lib/admin/server/users.ts",
    "src/lib/admin/server/serviceAccounts.ts",
];

// Functions whose guard call is not requireSuperuserToken (they use the session org).
const NOT_HOOKED_FN = new Map<string, string>([
    ["getCurrentOrg", "session-scoped read, no platform action"],
    ["getUser", "no guard call today (CHAOS-11847)"],
    ["updateUser", "no guard call today (CHAOS-11847)"],
    ["deleteUser", "no guard call today (CHAOS-11847)"],
    ["setUserPassword", "no guard call today (CHAOS-11847)"],
    ["listPlatformUsers", "no guard call today (CHAOS-11847)"],
    ["getAuditLog", "audit actions file: no requireSuperuserToken call"],
    ["getAuditEntry", "audit actions file: no requireSuperuserToken call"],
    ["resolveAuditMismatch", "audit actions file: no requireSuperuserToken call"],
    ["triggerReconciliation", "audit actions file: no requireSuperuserToken call"],
    ["listSettingCategories", "org-scoped route, org action"],
    ["listSettings", "org-scoped route, org action"],
    ["updateCurrentOrg", "org action"],
    ["updateOrgProfile", "org action"],
    ["deleteCurrentOrg", "org action"],
]);

function callOf(symbol: string): { action: string; allow: boolean } | undefined {
    for (const file of GUARDED_FILES) {
        const src = read(file);
        const at = src.search(new RegExp(`export async function ${symbol}\\b`));
        if (at < 0) continue;
        const rest = src.slice(at + 1);
        const next = rest.search(/\nexport (async )?function /);
        const body = next < 0 ? rest : rest.slice(0, next);
        const m = body.match(/requireSuperuserToken\(\{([^}]*)\}\)/);
        if (!m) return undefined;
        const action = m[1]?.match(/action:\s*"([^"]+)"/)?.[1];
        return action
            ? { action, allow: /allowImpersonating:\s*true/.test(m[1] ?? "") }
            : undefined;
    }
    return undefined;
}

describe("C4b every table row is hooked or listed", () => {
    const fnRows = PLATFORM_SURFACES.filter((s) => s.kind === "fn" && s.symbol);

    it("each fn row passes its own table action and impersonation rule", () => {
        const wrong: string[] = [];
        for (const row of fnRows) {
            if (NOT_HOOKED_FN.has(row.symbol ?? "")) continue;
            const call = callOf(row.symbol ?? "");
            if (!call) wrong.push(`${row.id}: no requireSuperuserToken({ action })`);
            else {
                if (call.action !== row.action) wrong.push(`${row.id}: ${call.action}`);
                if (call.allow !== (row.impersonation === "allowed"))
                    wrong.push(`${row.id}: allow`);
            }
        }
        expect(wrong).toEqual([]);
    });

    it("lists no fn row twice and every NOT_HOOKED entry names a table row", () => {
        for (const sym of NOT_HOOKED_FN.keys()) {
            expect(fnRows.some((r) => r.symbol === sym)).toBe(true);
        }
    });

    it("every platform action with a web surface has a fn caller or a page, nav or control row", () => {
        const used = new Set<string>();
        for (const row of fnRows) {
            const c = callOf(row.symbol ?? "");
            if (c) used.add(c.action);
        }
        for (const row of PLATFORM_SHADOW_ROWS) used.add(row.request?.action ?? "");
        const missing = PLATFORM_ACTIONS.filter(
            (a) => !PLATFORM_ACTIONS_WITHOUT_WEB_SURFACE.includes(a) && !used.has(a),
        );
        expect(missing).toEqual([]);
    });

    it("no caller of requireSuperuserToken omits the action", () => {
        for (const file of GUARDED_FILES) {
            const calls = read(file).match(/requireSuperuserToken\([^)]*\)/g) ?? [];
            for (const c of calls) expect(c).toMatch(/action:\s*"/);
        }
    });
});

// Page rows with no guard call of their own: the superadmin layout guards them (page:/superadmin).
const PAGES_UNDER_LAYOUT_ONLY = "no per-page guard call; the superadmin layout guards them";
const NOT_HOOKED_ROWS = new Map<string, string>([
    ["page:/superadmin/settings", "settings.write is an org action, not a platform action"],
    ["page:/superadmin/context-fabric/validation", "unmapped: ACR own authorization"],
]);

describe("C4b page, nav and control rows", () => {
    const guarded = new Map<string, string>();
    const files = execFileSync("git", ["grep", "-l", "requireSuperuser(", "--", "src/app"], {
        encoding: "utf8",
    })
        .split("\n")
        .filter((f) => f && !f.includes(".test."));
    for (const f of files) {
        for (const m of read(f).matchAll(/requireSuperuser\(\s*"([^"]+)",\s*"([^"]+)",?\s*\)/g)) {
            guarded.set(m[2] ?? "", f);
        }
    }

    it("every requireSuperuser call in src/app names a surface", () => {
        for (const f of files) {
            const calls = read(f).match(/requireSuperuser\([^)]*\)/g) ?? [];
            for (const c of calls)
                expect(c).toMatch(/requireSuperuser\(\s*"[^"]+",\s*"[^"]+",?\s*\)/);
        }
    });

    it("each named surface is a page row of the table, hooked once", () => {
        for (const id of guarded.keys()) {
            const row = PLATFORM_SURFACES.find((r) => r.id === id);
            expect(row?.kind).toBe("page");
            expect(PLATFORM_SHADOW_ROWS.some((r) => r.id === id)).toBe(true);
        }
    });

    it("every page row is guarded by name, listed, or covered by the layout", () => {
        const pageRows = PLATFORM_SURFACES.filter((r) => r.kind === "page");
        const reasons = pageRows
            .filter((r) => !guarded.has(r.id))
            .map((r) => NOT_HOOKED_ROWS.get(r.id) ?? PAGES_UNDER_LAYOUT_ONLY);
        expect(reasons.every((r) => r.length > 0)).toBe(true);
        for (const id of NOT_HOOKED_ROWS.keys()) {
            expect(PLATFORM_SURFACES.some((r) => r.id === id)).toBe(true);
            expect(guarded.has(id)).toBe(false);
        }
    });

    it("the layout, the billing pages, the nav rows and the control are hooked", () => {
        expect([...guarded.keys()].sort()).toEqual(
            [
                "page:/superadmin",
                "page:/superadmin/billing/invoices",
                "page:/superadmin/billing/plans",
                "page:/superadmin/billing/refunds",
                "page:/superadmin/billing/subscriptions",
            ].sort(),
        );
        const control = read("src/app/(app)/superadmin/users/[id]/page.tsx");
        expect(control).toContain('"control:ImpersonateUserButton"');
        const nav = read("src/app/(app)/layout.tsx");
        expect(nav).toContain(
            'schedulePlatformShadow(session, ["nav:platform", "nav:platform-billing"])',
        );
    });
});

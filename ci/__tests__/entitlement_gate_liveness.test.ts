import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { verifyEntitlementSymbols } from "../discover_web_routes";

const WEB_ROOT = resolve(__dirname, "../..");

vi.setConfig({ testTimeout: 60_000 });

const PAGER =
    "src/lib/admin/server/canonicalIncidentIngestion.ts#requirePagerDutyCreationEntitlement";
const ACR = "src/lib/acr/ops.ts#requireAcrEntitlement";
const RESOLVE = "src/lib/acr/ops.ts#resolveOpsCredentialIssuanceAuthorization";

const GOOD_PAGER =
    "export async function requirePagerDutyCreationEntitlement(): Promise<void> {\n" +
    "    const entitlement = await getCanonicalIncidentIngestionEntitlement();\n" +
    "    if (entitlement.data?.enabled !== true) { throw new Error('no'); }\n}\n";
const GOOD_ACR =
    "export async function requireAcrEntitlement(): Promise<void> {\n" +
    "    const entitlement = await fetchBoundedJson({});\n" +
    "    if (entitlement.status !== 200) { throw new Error('down'); }\n" +
    "    const parsed = schema.safeParse(entitlement.value);\n" +
    "    if (!parsed.success || !parsed.data.is_valid) { throw new Error('no'); }\n}\n" +
    "export async function resolveOpsCredentialIssuanceAuthorization() { await requireAcrEntitlement(); return 1; }\n";

function tree(pager: string, acr: string): string {
    const dir = mkdtempSync(join(tmpdir(), "web-live-"));
    const files: Record<string, string> = {
        "src/lib/admin/server/canonicalIncidentIngestion.ts": pager,
        "src/lib/acr/ops.ts": acr,
    };
    for (const [name, text] of Object.entries(files)) {
        mkdirSync(join(dir, name, ".."), { recursive: true });
        writeFileSync(join(dir, name), text);
    }
    return dir;
}

function bad(pager: string, acr: string): string[] {
    const dir = tree(pager, acr);
    try {
        return verifyEntitlementSymbols(dir);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

describe("entitlementGateIsLive", () => {
    it("accepts the real gates and a faithful fixture", () => {
        expect(verifyEntitlementSymbols(WEB_ROOT)).toEqual([]);
        expect(bad(GOOD_PAGER, GOOD_ACR)).toEqual([]);
    });

    const hollowPager: Record<string, string> = {
        "a condition the entitlement does not control (Math.random() < 0 && ...)":
            "export async function requirePagerDutyCreationEntitlement(): Promise<void> {\n" +
            "    const entitlement = await getCanonicalIncidentIngestionEntitlement();\n" +
            "    if (Math.random() < 0 && entitlement.data?.enabled !== true) { throw new Error('no'); }\n}\n",
        "a non-derived identifier in the condition":
            "export async function requirePagerDutyCreationEntitlement(): Promise<void> {\n" +
            "    const entitlement = await getCanonicalIncidentIngestionEntitlement();\n" +
            "    if (flag || entitlement.data?.enabled !== true) { throw new Error('no'); }\n}\n",
        "a throw that a try/catch swallows":
            "export async function requirePagerDutyCreationEntitlement(): Promise<void> {\n" +
            "    try {\n" +
            "        const entitlement = await getCanonicalIncidentIngestionEntitlement();\n" +
            "        if (entitlement.data?.enabled !== true) { throw new Error('no'); }\n" +
            "    } catch {}\n}\n",
        "a throw inside a try that sits in the rejecting branch":
            "export async function requirePagerDutyCreationEntitlement(): Promise<void> {\n" +
            "    const entitlement = await getCanonicalIncidentIngestionEntitlement();\n" +
            "    if (entitlement.data?.enabled !== true) { try { throw new Error('no'); } catch {} }\n}\n",
        "a call whose result is ignored":
            "export async function requirePagerDutyCreationEntitlement(): Promise<void> {\n" +
            "    await getCanonicalIncidentIngestionEntitlement();\n" +
            "    if (other.data?.enabled !== true) { throw new Error('no'); }\n}\n",
        "a rejecting if nested under an unrelated condition":
            "export async function requirePagerDutyCreationEntitlement(): Promise<void> {\n" +
            "    const entitlement = await getCanonicalIncidentIngestionEntitlement();\n" +
            "    if (process.env.X) { if (entitlement.data?.enabled !== true) { throw new Error('no'); } }\n}\n",
        "a call that is not awaited":
            "export async function requirePagerDutyCreationEntitlement(): Promise<void> {\n" +
            "    const entitlement = getCanonicalIncidentIngestionEntitlement();\n" +
            "    if (entitlement.data?.enabled !== true) { throw new Error('no'); }\n}\n",
        "an early return before the check":
            "export async function requirePagerDutyCreationEntitlement(): Promise<void> {\n" +
            "    const entitlement = await getCanonicalIncidentIngestionEntitlement();\n" +
            "    return;\n" +
            "    if (entitlement.data?.enabled !== true) { throw new Error('no'); }\n}\n",
        "a plain return":
            "export async function requirePagerDutyCreationEntitlement(): Promise<void> { return; }\n",
    };
    for (const [label, pager] of Object.entries(hollowPager)) {
        it(`rejects a rejecting gate with ${label}`, () => {
            expect(bad(pager, GOOD_ACR)).toEqual([PAGER]);
        });
    }

    it("rejects a hollow acr gate whose condition ignores the fetched result", () => {
        const acr =
            "export async function requireAcrEntitlement(): Promise<void> {\n" +
            "    const entitlement = await fetchBoundedJson({});\n" +
            "    if (Math.random() < 0) { throw new Error('no'); }\n" +
            "    schema.safeParse(entitlement.value);\n}\n" +
            "export async function resolveOpsCredentialIssuanceAuthorization() { await requireAcrEntitlement(); return 1; }\n";
        expect(bad(GOOD_PAGER, acr)).toEqual([ACR]);
    });

    it("rejects a delegating gate that no longer awaits the gate it delegates to", () => {
        for (const body of [
            "return 1;",
            "if (flag) { await requireAcrEntitlement(); } return 1;",
            "requireAcrEntitlement(); return 1;",
        ]) {
            const acr =
                GOOD_ACR.split("export async function resolveOps")[0] +
                `export async function resolveOpsCredentialIssuanceAuthorization() { ${body} }\n`;
            expect(bad(GOOD_PAGER, acr), body).toEqual([RESOLVE]);
        }
    });
});

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";
import { CANONICAL_INCIDENT_INGESTION_FEATURE } from "../../src/lib/admin/canonicalIncidentIngestion";

const WEB_ROOT = resolve(__dirname, "../..");
const HELPER = "requirePagerDutyCreationEntitlement";
const FILES = [
    "src/lib/admin/server/pagerduty.ts",
    "src/lib/admin/server/credentials.ts",
    "src/lib/admin/server/sync.ts",
];

vi.setConfig({ testTimeout: 60_000 });

type Row = { id: string; entitlement_requirement?: string | null; gaps?: string[] };

function loadRows(): Map<string, Row> {
    const doc = JSON.parse(
        readFileSync(join(WEB_ROOT, "contracts/auth/v1/endpoint-profiles.web.json"), "utf8"),
    ) as { rows: Row[] };
    return new Map(doc.rows.map((r) => [r.id, r]));
}

function exportsCallingHelper(): string[] {
    const cfg = ts.readConfigFile(join(WEB_ROOT, "tsconfig.json"), ts.sys.readFile);
    const options = {
        ...ts.parseJsonConfigFileContent(cfg.config, ts.sys, WEB_ROOT).options,
        noEmit: true,
        skipLibCheck: true,
        types: [],
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        module: ts.ModuleKind.ESNext,
    };
    const abs = FILES.map((f) => join(WEB_ROOT, f));
    const program = ts.createProgram({ rootNames: abs, options });
    const checker = program.getTypeChecker();
    const ids: string[] = [];
    for (const file of FILES) {
        const sf = program.getSourceFile(join(WEB_ROOT, file));
        if (!sf) throw new Error(`${file} not in program`);
        for (const stmt of sf.statements) {
            if (
                !ts.isFunctionDeclaration(stmt) ||
                !stmt.name ||
                !stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
            )
                continue;
            let hit = false;
            const visit = (n: ts.Node) => {
                if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
                    let sym = checker.getSymbolAtLocation(n.expression);
                    if (sym && sym.flags & ts.SymbolFlags.Alias)
                        sym = checker.getAliasedSymbol(sym);
                    const d = sym?.declarations?.[0];
                    if (
                        d &&
                        ts.isFunctionDeclaration(d) &&
                        d.name?.text === HELPER &&
                        d
                            .getSourceFile()
                            .fileName.endsWith("src/lib/admin/server/canonicalIncidentIngestion.ts")
                    )
                        hit = true;
                }
                ts.forEachChild(n, visit);
            };
            visit(stmt);
            if (hit) ids.push(`server_action:${file}#${stmt.name.text}`);
        }
    }
    return ids;
}

describe("entitlement_requirement rows follow the call walk to requirePagerDutyCreationEntitlement", () => {
    const rows = loadRows();
    const callers = exportsCallingHelper();

    it("finds the six direct callers in the three files", () => {
        expect(callers.sort()).toEqual([
            "server_action:src/lib/admin/server/credentials.ts#createCredential",
            "server_action:src/lib/admin/server/pagerduty.ts#connectPagerDutyApiToken",
            "server_action:src/lib/admin/server/pagerduty.ts#connectPagerDutyClientCredentials",
            "server_action:src/lib/admin/server/pagerduty.ts#startPagerDutyOAuth",
            "server_action:src/lib/admin/server/sync.ts#batchCreateSyncConfigs",
            "server_action:src/lib/admin/server/sync.ts#createSyncConfig",
        ]);
    });

    it("every caller row records the feature key the helper checks", () => {
        for (const id of callers) {
            const row = rows.get(id);
            expect(row, id).toBeDefined();
            expect(row?.entitlement_requirement, id).toBe(CANONICAL_INCIDENT_INGESTION_FEATURE);
            expect(
                (row?.gaps ?? []).some((g) => g.trimStart().startsWith("entitlement_requirement:")),
                `${id} keeps a stale entitlement_requirement gap`,
            ).toBe(false);
        }
    });

    it("the helper's own row records the same key, not a hyphenated spelling", () => {
        const row = rows.get(
            `server_action:src/lib/admin/server/canonicalIncidentIngestion.ts#${HELPER}`,
        );
        expect(row?.entitlement_requirement).toBe(CANONICAL_INCIDENT_INGESTION_FEATURE);
    });
});

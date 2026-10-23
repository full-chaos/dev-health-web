import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export const ROOT = path.resolve(__dirname, "../../..");
const SCAN_DIRS = ["src"];
const SCAN_FILES = ["instrumentation.ts", "sentry.server.config.ts", "sentry.edge.config.ts"];
const LEVELS = new Set(["trace", "debug", "info", "warn", "error", "fatal"]);
const LOG_NAMES = new Set(["log", "logger"]);
const FORBIDDEN_FIELDS = new Set([
    "request",
    "req",
    "headers",
    "cookies",
    "cookie",
    "token",
    "accesstoken",
    "refreshtoken",
    "idtoken",
    "assertion",
    "session",
    "body",
    "variables",
    "graphqlerrors",
    "authorization",
    "password",
    "secret",
]);

export type SinkRow = { log: number; sentry: number };
export type Scan = { table: Record<string, SinkRow>; violations: string[] };

function isTestFile(rel: string): boolean {
    return (
        /(^|\/)__tests__\//.test(rel) ||
        /\.(test|spec)\.[cm]?[tj]sx?$/.test(rel) ||
        rel.startsWith("src/test/") ||
        rel.endsWith(".scan.ts")
    );
}

function walk(dir: string, out: string[]): void {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel, out);
        else if (/\.[cm]?[tj]sx?$/.test(entry.name) && !isTestFile(rel)) out.push(rel);
    }
}

function normalize(name: string): string {
    return name.replace(/[^a-z\d]/gi, "").toLowerCase();
}

function fieldName(prop: ts.ObjectLiteralElementLike): string | null {
    const name = prop.name;
    if (!name) return null;
    if (
        ts.isIdentifier(name) ||
        ts.isStringLiteral(name) ||
        ts.isNoSubstitutionTemplateLiteral(name)
    )
        return name.text;
    return null;
}

export function scanSinks(): Scan {
    const files: string[] = SCAN_FILES.filter((f) => fs.existsSync(path.join(ROOT, f)));
    for (const dir of SCAN_DIRS) walk(dir, files);
    files.sort();
    const table: Record<string, SinkRow> = {};
    const violations: string[] = [];

    for (const rel of files) {
        const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
        const kind = rel.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
        const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
        const parseDiagnostics = (source as unknown as { parseDiagnostics: ts.Diagnostic[] })
            .parseDiagnostics;
        const at = (node: ts.Node) =>
            `${rel}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
        if (parseDiagnostics.length > 0) {
            violations.push(`P1 ${rel}:${parseDiagnostics[0].start ?? 0}`);
            continue;
        }
        const row: SinkRow = { log: 0, sentry: 0 };
        let consoleRefs = 0;

        const visit = (node: ts.Node): void => {
            if (
                ts.isPropertyAccessExpression(node) &&
                ts.isIdentifier(node.expression) &&
                node.expression.text === "console"
            ) {
                consoleRefs += 1;
                if (rel !== "src/lib/logger.ts") violations.push(`R1 ${at(node)}`);
            }
            if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
                const callee = node.expression;
                if (
                    ts.isIdentifier(callee.expression) &&
                    LOG_NAMES.has(callee.expression.text) &&
                    LEVELS.has(callee.name.text)
                ) {
                    row.log += 1;
                    const first = node.arguments[0];
                    if (first && ts.isObjectLiteralExpression(first)) {
                        for (const prop of first.properties) {
                            const name = fieldName(prop);
                            if (name !== null && FORBIDDEN_FIELDS.has(normalize(name)))
                                violations.push(`R2 ${at(prop)}`);
                            if (
                                ts.isSpreadAssignment(prop) &&
                                (ts.isIdentifier(prop.expression) ||
                                    ts.isPropertyAccessExpression(prop.expression))
                            )
                                violations.push(`R2 ${at(prop)}`);
                        }
                    } else if (
                        first &&
                        ts.isIdentifier(first) &&
                        FORBIDDEN_FIELDS.has(normalize(first.text))
                    ) {
                        violations.push(`R2 ${at(first)}`);
                    }
                } else if (
                    ts.isIdentifier(callee.expression) &&
                    callee.expression.text === "Sentry"
                ) {
                    if (callee.name.text !== "init") row.sentry += 1;
                } else if (
                    ts.isIdentifier(callee.expression) &&
                    callee.expression.text === "scope"
                ) {
                    row.sentry += 1;
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(source);

        if (rel === "src/lib/logger.ts" && consoleRefs !== 6) violations.push(`R1 ${rel}:0`);
        if (row.log > 0 || row.sentry > 0) table[rel] = row;
    }
    return { table, violations };
}

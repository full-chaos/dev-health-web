import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Names that are dead in the services web talks to, each proven against that service's source.
// Only a proven-dead name belongs here: HS256 names stay while the HS256 retirement is open.
const DEAD: { name: string; pattern: RegExp; why: string }[] = [
    {
        name: "ACR_DEV_HEALTH_ENTITLEMENT_CREDENTIAL = service_token",
        pattern: /ACR_DEV_HEALTH_ENTITLEMENT_CREDENTIAL.*service_token/,
        why: "acr accepts only unset or `workload` and refuses the retired value",
    },
    {
        name: "ACR_DEV_HEALTH_ENTITLEMENT_TOKEN_FILE",
        pattern: /ACR_DEV_HEALTH_ENTITLEMENT_TOKEN_FILE/,
        why: "acr ignores the retired service token file setting",
    },
];

// The assertion-key-rotation drill still sets the retired token file; removing it needs a drill
// rehearsal, so it is a named follow-up and the only exempt path.
const EXEMPT = [
    "scripts/drills/assertion-key-rotation/stack.yaml",
    "ci/__tests__/retired_names.test.ts",
];

export function scan(root: string, files: string[]): string[] {
    if (files.length === 0)
        throw new Error("retired-names scan read 0 files; an empty scan is not a pass");
    const hits: string[] = [];
    for (const file of files) {
        if (EXEMPT.includes(file)) continue;
        const lines = readFileSync(path.join(root, file), "utf8").split("\n");
        lines.forEach((line, index) => {
            for (const dead of DEAD) {
                if (dead.pattern.test(line)) hits.push(`${file}:${index + 1}: ${dead.name}`);
            }
        });
    }
    return hits;
}

const root = path.resolve(__dirname, "../..");
const TEXT = /\.(ts|tsx|js|mjs|json|md|yaml|yml|sh|env|example)$|^Dockerfile$/;

describe("no retired credential name in web", () => {
    it("tracked files carry none", () => {
        const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
            .split("\n")
            .filter((f) => f !== "" && TEXT.test(f) && !f.endsWith("pnpm-lock.yaml"));
        expect(scan(root, files)).toEqual([]);
    });

    it("catches a planted dead name and passes a clean file", () => {
        const dir = mkdtempSync(path.join(tmpdir(), "retired-names-"));
        try {
            mkdirSync(path.join(dir, "docs"));
            writeFileSync(
                path.join(dir, "docs/old.md"),
                "| `ACR_DEV_HEALTH_ENTITLEMENT_CREDENTIAL` | ACR | `service_token` |\n",
            );
            writeFileSync(
                path.join(dir, "docs/tok.md"),
                "set ACR_DEV_HEALTH_ENTITLEMENT_TOKEN_FILE=/x\n",
            );
            writeFileSync(
                path.join(dir, "docs/ok.md"),
                "| `ACR_DEV_HEALTH_ENTITLEMENT_CREDENTIAL` | ACR | `workload` |\n",
            );
            expect(scan(dir, ["docs/old.md"])).toEqual([
                "docs/old.md:1: ACR_DEV_HEALTH_ENTITLEMENT_CREDENTIAL = service_token",
            ]);
            expect(scan(dir, ["docs/tok.md"])).toHaveLength(1);
            expect(scan(dir, ["docs/ok.md"])).toEqual([]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("fails an empty scan", () => {
        expect(() => scan(root, [])).toThrow(/0 files/);
    });
});

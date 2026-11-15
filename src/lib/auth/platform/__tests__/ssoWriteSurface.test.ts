import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ORG_IMPERSONATION_DENIED_ACTIONS } from "../actionTable";

// The ops catalog denies sso.write to a delegated session and the table lists it. This census reads every non-test
// source file: a file that names the action or the SSO provider management routes must route its write through the
// refusal, so a web surface cannot start performing the write without the impersonation check.

const SRC = join(__dirname, "..", "..", "..", "..");
const TABLE_FILE = join(SRC, "lib/auth/platform/actionTable.ts");

function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "__tests__" || full === join(SRC, "lib/acr/contracts")) continue;
            out.push(...sourceFiles(full));
        } else if (
            /\.(ts|tsx|js|mjs)$/.test(entry.name) &&
            !/\.test\.|generated\.ts$/.test(entry.name)
        ) {
            out.push(full);
        }
    }
    return out;
}

const REFUSAL_CALL =
    /(refuseOrgWrite\([^,()]+,\s*"sso\.write"|getSessionContext\(\{\s*write:\s*"sso\.write")/;
const NAMES_THE_WRITE = /sso\.write|\/sso\/providers/;

export function unguardedSsoWriteFiles(files: { file: string; text: string }[]): string[] {
    return files
        .filter(
            ({ file, text }) =>
                file !== TABLE_FILE && NAMES_THE_WRITE.test(text) && !REFUSAL_CALL.test(text),
        )
        .map(({ file }) => file);
}

const files = sourceFiles(SRC).map((file) => ({ file, text: readFileSync(file, "utf8") }));

describe("a web surface that performs the ops sso.write action refuses it while impersonating", () => {
    it("reads a non-trivial source tree", () => {
        expect(files.length).toBeGreaterThan(500);
    });

    it("lists sso.write in the impersonation table", () => {
        expect(ORG_IMPERSONATION_DENIED_ACTIONS as readonly string[]).toContain("sso.write");
    });

    it("has no source file that names the action or the provider routes without the refusal", () => {
        expect(unguardedSsoWriteFiles(files)).toEqual([]);
    });

    it("RED: a file naming the provider route without the refusal is caught", () => {
        const route = {
            file: "/x/route.ts",
            text: 'fetch("/api/v1/sso/providers", { method: "POST" })',
        };
        expect(unguardedSsoWriteFiles([...files, route])).toEqual([route.file]);
    });

    it("GREEN: the same file with the refusal is not flagged", () => {
        const route = {
            file: "/x/route.ts",
            text: 'if (await refuseOrgWrite(session, "sso.write")) return;\nfetch("/api/v1/sso/providers")',
        };
        expect(unguardedSsoWriteFiles([...files, route])).toEqual([]);
    });

    it("passes only table actions to refuseOrgWrite and to the session-context write option", () => {
        const used = new Set<string>();
        for (const { text } of files) {
            for (const match of text.matchAll(/refuseOrgWrite\([^,()]+,\s*"([a-z_.]+)"/g))
                used.add(match[1]);
            for (const match of text.matchAll(/getSessionContext\(\{\s*write:\s*"([a-z_.]+)"/g))
                used.add(match[1]);
        }
        expect(used.size).toBeGreaterThan(0);
        for (const action of used) {
            expect(ORG_IMPERSONATION_DENIED_ACTIONS as readonly string[]).toContain(action);
        }
    });
});

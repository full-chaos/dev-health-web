import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(join(__dirname, "../../.github/workflows/live-e2e.yml"), "utf8");
const lines = workflow.split("\n");

describe("live-e2e workflow keeps bearers and CA trust out of the wrong places", () => {
    it("never prints a response file that can hold a token", () => {
        const printed = lines.filter((line) =>
            /^\s*(cat|tee)\b.*\/tmp\/(login|reg|audit-login)\.json/.test(line),
        );
        expect(printed).toEqual([]);
    });

    it("never prints a token variable or an Authorization header", () => {
        const leaks = lines.filter(
            (line) =>
                /^\s*(echo|printf)\b.*(\$\{?token\}?|Authorization)/.test(line) ||
                /^\s*set\s+-[a-z]*x/.test(line),
        );
        expect(leaks).toEqual([]);
    });

    it("does not export the web environment into the step shell that starts the runner", () => {
        expect(workflow).not.toMatch(/export\s+"\$\{line%%=\*\}=/);
        expect(workflow).not.toMatch(/print-env\s+web/);
    });

    it("starts go-api with a link token secret made in the job, never a literal one", () => {
        const start = lines.findIndex((line) => /with-env go-api /.test(line));
        expect(start, "no go-api start line").toBeGreaterThan(0);
        expect(lines[start - 1]).toMatch(/^\s*LINK_TOKEN_SECRET="\$\{link_token_secret\}" \\$/);
        expect(workflow).toMatch(/link_token_secret="\$\(openssl rand -hex 32\)"/);
        expect(workflow).toMatch(/::add-mask::\$\{link_token_secret\}/);
        expect(workflow).not.toMatch(/^\s*LINK_TOKEN_SECRET:/m);
    });

    it("hands the web-server wrapper to the runner, not the CA variables", () => {
        expect(workflow).toMatch(/LIVE_E2E_WEB_WRAPPER:.*with-env web/);
    });
});

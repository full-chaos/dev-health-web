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

    it("gives the web decisions step the wrapper and the stack control, and no CA or token variable", () => {
        const start = workflow.indexOf("Run web decisions live tier");
        const end = workflow.indexOf("Upload the web decisions server logs");
        const step = workflow.slice(start, end);
        expect(step).toMatch(/LIVE_E2E_WEB_WRAPPER:.*with-env web/);
        expect(step).toMatch(/LIVE_E2E_STACK_SCRIPT:.*live_e2e_auth_stack\.sh/);
        expect(step).toMatch(/LIVE_E2E_STACK_STATE:/);
        expect(step).not.toMatch(/SSL_CERT_FILE|NODE_EXTRA_CA_CERTS|AUTH_WORKLOAD|AUTHZ_/);
    });

    it("builds the go-api environment copy from with-env, not from /proc of a process that may not have exec'd yet", () => {
        // /proc/<pid>/environ read right after the background start can be the shell's own environment, without the auth
        // flags: the guided restart then ran go-api with no auth-service proxy (upstream_host "").
        expect(workflow).not.toMatch(/\/proc\/[^\n]*\/environ/);
        expect(workflow).toMatch(
            /with-env go-api "\$\{RUNNER_TEMP\}\/live-e2e-auth" -- env -0 >\/tmp\/dev-health-go-api\.environ/,
        );
    });

    it("runs the web decisions tier and the live tiers in separate jobs, so they share no login limit window", () => {
        const stepIf = (name: string) => {
            const at = lines.findIndex((line) => line.includes(`- name: ${name}`));
            expect(at, `no step ${name}`).toBeGreaterThan(0);
            const rest = lines.slice(at + 1);
            const next = rest.findIndex((line) => /^\s+- name: /.test(line));
            return (
                rest.slice(0, next < 0 ? undefined : next).find((line) => /^\s+if: /.test(line)) ??
                ""
            );
        };
        // One job per tier (live, guided, web decisions): no two tiers share auth-service's login window.
        expect(workflow).toMatch(
            /^\s+tier: \[live, guided, web-decisions, web-decisions-classes, web-decisions-admin-users\]$/m,
        );
        expect(workflow).not.toMatch(/ci\/run_tests\.sh live-e2e-two-pass/);
        expect(stepIf("Run web decisions live tier (flip F11)")).toMatch(
            /^\s+if: matrix\.tier == 'web-decisions' \|\| matrix\.tier == 'web-decisions-classes' \|\| matrix\.tier == 'web-decisions-admin-users'$/,
        );
        expect(stepIf("Run live backend e2e tier")).toMatch(
            /^\s+if: matrix\.tier == 'live' \|\| matrix\.tier == 'guided'$/,
        );
    });
});

// Selftest of the forced sign-out drill (scripts/drills/session-forced-signout/drill.sh): the cells
// are judged on scripted helper answers, with no web server and no real wait.
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { isSessionCookieName } from "../drill.ts";

const DRILL = resolve(import.meta.dirname, "../drill.sh");

// The helper stand-in. Each read answers by jar and by how many times that jar was read:
// STALE_FIRST / STALE_SECOND are the stale copy's answers before and after the bound;
// LOGIN_OK=0 makes the first login fail as the real helper does (exit 1, session_cookie=0).
const HELPER = `#!/usr/bin/env bash
set -euo pipefail
state="$STUB_STATE"
case "$1" in
    login)
        if [ "\${LOGIN_OK:-1}" = 0 ]; then echo "LOGIN code=200 session_cookie=0"; exit 1; fi
        echo '{}' >"$3"; echo "LOGIN code=302 session_cookie=1" ;;
    copy) cp "$2" "$3" ;;
    deactivate) : >"$state/deactivated"; echo "DEACTIVATE code=200" ;;
    read)
        jar="$(basename "$2" .json)"
        n=$(( $(cat "$state/$jar" 2>/dev/null || echo 0) + 1 )); echo "$n" >"$state/$jar"
        out=0
        if [ ! -e "$state/deactivated" ] || [ "$jar" = c ]; then out=1; fi
        if [ "$jar" = stale ] && [ "$n" = 1 ]; then out="$STALE_FIRST"; fi
        if [ "$jar" = stale ] && [ "$n" = 2 ]; then out="$STALE_SECOND"; fi
        if [ "$out" = 1 ]; then echo "READ code=200 signed_in=1 error=none session_cookie=1"; else echo "READ code=200 signed_in=0 error=user_invalid session_cookie=1"; fi ;;
esac
`;

const dirs = [];
afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function runS1(env) {
    const root = mkdtempSync(join(tmpdir(), "drill-selftest-"));
    dirs.push(root);
    const drillDir = join(root, "drill");
    const bin = join(root, "bin");
    const state = join(root, "state");
    for (const dir of [drillDir, bin, state]) mkdirSync(dir, { recursive: true });
    chmodSync(drillDir, 0o700);
    writeFileSync(join(bin, "sleep"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });
    writeFileSync(join(root, "helper"), HELPER, { mode: 0o755 });
    const result = spawnSync("bash", [DRILL, "s1"], {
        encoding: "utf8",
        env: {
            PATH: `${bin}:${process.env.PATH}`,
            WEB_URL: "http://web.test",
            API_URL: "http://api.test",
            DRILL_DIR: drillDir,
            TARGET_USER_ID: "11111111-1111-4111-8111-111111111111",
            DRILL_HELPER: join(root, "helper"),
            STUB_STATE: state,
            STALE_FIRST: "1",
            STALE_SECOND: "0",
            ...env,
        },
    });
    const record = readFileSync(join(drillDir, "records", "drill.txt"), "utf8");
    return { status: result.status, record };
}

describe("forced sign-out drill, s1", () => {
    it("passes when the stale copy keeps its session through the memo hit and is out at the bound", () => {
        const { status, record } = runS1({});
        expect(status).toBe(0);
        expect(record).toMatch(/^NOTE: c2-stale-copy-path=memo_hit /m);
        expect(record).toMatch(/^PASS: c2-stale-copy-signed-out-within-60s /m);
    });

    it("passes when the stale copy was due itself and is refused before the bound (run B, 2026-11-06)", () => {
        const { status, record } = runS1({ STALE_FIRST: "0" });
        expect(status).toBe(0);
        expect(record).toMatch(/^NOTE: c2-stale-copy-path=validated /m);
        expect(record).not.toMatch(/^FAIL:/m);
    });

    it("fails when the stale copy is still signed in after the bound", () => {
        const { status, record } = runS1({ STALE_SECOND: "1" });
        expect(status).toBe(1);
        expect(record).toMatch(/^FAIL: c2-stale-copy-signed-out-within-60s /m);
    });

    it("fails when a login does not set a session cookie", () => {
        const { status, record } = runS1({ LOGIN_OK: "0" });
        expect(status).toBe(1);
        expect(record).toMatch(/^FAIL: login-a /m);
    });
});

describe("session cookie names", () => {
    it.each([
        "authjs.session-token",
        "__Secure-authjs.session-token",
        "__Secure-authjs.session-token.0",
        "next-auth.session-token",
        "__Host-authjs.session-token",
    ])("%s is a session cookie", (name) => {
        expect(isSessionCookieName(name)).toBe(true);
    });

    it.each([
        "authjs.csrf-token",
        "__Host-authjs.csrf-token",
        "authjs.callback-url",
        "xauthjs.session-token",
    ])("%s is not a session cookie", (name) => {
        expect(isSessionCookieName(name)).toBe(false);
    });
});

describe("drill.sh syntax", () => {
    it("parses", () => {
        expect(() => execFileSync("bash", ["-n", DRILL])).not.toThrow();
    });
});

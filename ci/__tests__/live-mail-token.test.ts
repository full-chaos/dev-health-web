import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@playwright/test", () => ({ expect: () => undefined, test: { skip: vi.fn() } }));

import { test } from "@playwright/test";
import { mailTokenViaStack, waitForMailToken } from "../../tests/live/helpers";

const TOKEN = "sentinel-mail-token-do-not-print";
const EMAIL = "sentinel-recipient@example.com";
let stackDir = "";

beforeEach(() => {
    stackDir = mkdtempSync(join(tmpdir(), "live-mail-stack-"));
    const script = join(stackDir, "stack.sh");
    writeFileSync(
        script,
        [
            "#!/bin/bash",
            '[ "$1" = mail-token ] && [ "$3" = "' + EMAIL + '" ] || exit 2',
            '[ "$4" = reset ] || [ "$4" = verify ] || exit 2',
            'if [ -f "$2/fail" ]; then',
            `  printf '%s\\n' '${TOKEN}'`,
            `  printf '%s\\n' '${TOKEN} ${EMAIL}' >&2`,
            "  exit 1",
            "fi",
            'if [ -f "$2/crash" ]; then',
            `  printf '%s\\n' '${TOKEN} ${EMAIL}' >&2`,
            `  printf '%s\\n' '${TOKEN}'`,
            "  kill -TERM $$",
            "fi",
            'cat "$2/token" 2>/dev/null',
            "",
        ].join("\n"),
    );
    vi.stubEnv("LIVE_E2E_STACK_SCRIPT", script);
    vi.stubEnv("LIVE_E2E_STACK_STATE", stackDir);
    vi.stubEnv("CI", "");
    vi.mocked(test.skip).mockClear();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    rmSync(stackDir, { recursive: true, force: true });
});

describe("mail tokens through the local stack", () => {
    it.each(["reset", "verify"] as const)("trims successful %s output", (kind) => {
        writeFileSync(join(stackDir, "token"), `${TOKEN}\n`);
        expect(mailTokenViaStack(EMAIL, kind) === TOKEN).toBe(true);
    });

    it("discards both output streams on a nonzero exit", () => {
        writeFileSync(join(stackDir, "fail"), "");
        expect(mailTokenViaStack(EMAIL, "reset")).toBeNull();
    });

    it("discards crash diagnostics without exposing the recipient or output", () => {
        writeFileSync(join(stackDir, "crash"), "");
        let result: string | null = null;
        let message = "";
        try {
            result = mailTokenViaStack(EMAIL, "reset");
        } catch (error) {
            message = error instanceof Error ? error.message : String(error);
        }
        expect(result).toBeNull();
        expect(message.includes(TOKEN) || message.includes(EMAIL)).toBe(false);
        expect(["", "mail token lookup failed"]).toContain(message);
    });

    it.each(["LIVE_E2E_STACK_SCRIPT", "LIVE_E2E_STACK_STATE"])(
        "uses the environment-fault path with %s unset",
        (name) => {
            vi.stubEnv(name, undefined);
            expect(mailTokenViaStack(EMAIL, "reset")).toBeNull();
            expect(test.skip).toHaveBeenCalledWith(true, "mail token stack is not configured");
        },
    );

    it("throws only a fixed environment fault under CI", () => {
        vi.stubEnv("CI", "true");
        vi.stubEnv("LIVE_E2E_STACK_SCRIPT", undefined);
        expect(() => mailTokenViaStack(EMAIL, "reset")).toThrow(
            /^ENVIRONMENT FAULT \(live-e2e would have skipped\): mail token stack is not configured$/,
        );
    });

    it("polls until mail arrives", async () => {
        vi.useFakeTimers();
        const pending = waitForMailToken(EMAIL, "reset");
        writeFileSync(join(stackDir, "token"), `${TOKEN}\n`);
        await vi.advanceTimersByTimeAsync(250);
        expect((await pending) === TOKEN).toBe(true);
    });

    it("ignores the previous token until a different one arrives", async () => {
        vi.useFakeTimers();
        writeFileSync(join(stackDir, "token"), `${TOKEN}\n`);
        let resolved = false;
        const pending = waitForMailToken(EMAIL, "reset", { not: TOKEN }).then((value) => {
            resolved = true;
            return value;
        });
        await vi.advanceTimersByTimeAsync(250);
        expect(resolved).toBe(false);
        writeFileSync(join(stackDir, "token"), "replacement\n");
        await vi.advanceTimersByTimeAsync(250);
        expect((await pending) === "replacement").toBe(true);
    });

    it.each([false, true])("times out with fixed text only (old mail: %s)", async (oldMail) => {
        vi.useFakeTimers();
        if (oldMail) writeFileSync(join(stackDir, "token"), `${TOKEN}\n`);
        const pending = waitForMailToken(EMAIL, "reset", { timeoutMs: 500, not: TOKEN });
        const assertion = expect(pending).rejects.toThrow(/^mail token did not arrive$/);
        await vi.advanceTimersByTimeAsync(500);
        await assertion;
    });
});

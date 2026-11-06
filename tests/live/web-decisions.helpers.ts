import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { envFault } from "./helpers";

// The web server of the decisions pass writes its stdout (JSON lines) to LIVE_WEB_LOG. One line is one decision of the
// decision client; the field set is closed (guard, action, allowed, source, reason_code, request_id): no token, no org id.

export interface DecisionLine {
    guard: string;
    action: string;
    allowed: boolean;
    source: string;
    reason_code: string;
}

export function webLogPath(): string {
    const path = process.env.LIVE_WEB_LOG ?? "web-decisions-logs/web-server.log";
    try {
        statSync(path);
    } catch {
        envFault(
            `the web server log ${path} does not exist: the decisions pass must start the server itself`,
        );
    }
    return path;
}

function lines(path: string): Record<string, unknown>[] {
    const out: Record<string, unknown>[] = [];
    for (const raw of readFileSync(path, "utf8").split("\n")) {
        if (!raw.startsWith("{")) continue;
        try {
            out.push(JSON.parse(raw) as Record<string, unknown>);
        } catch {
            // A partial line at the end of a file that is still written.
        }
    }
    return out;
}

function named(path: string, message: string): Record<string, unknown>[] {
    return lines(path).filter((l) => (l.msg ?? l.message) === message);
}

/** How many decision lines the log holds now: take it before an action, pass it to decisionsSince after. */
export function mark(path: string): number {
    return named(path, "authz_decide").length;
}

export function decisionsSince(path: string, since: number, guard: string): DecisionLine[] {
    return named(path, "authz_decide")
        .slice(since)
        .filter((l) => l.guard === guard) as unknown as DecisionLine[];
}

export function shadowRuns(path: string): number {
    return named(path, "authz_shadow_decide").length;
}

export function decideLines(path: string): number {
    return named(path, "authz_decide").length;
}

/** The next decision of guard after the mark, polled: the server writes the line while it answers. */
export async function nextDecision(
    path: string,
    since: number,
    guard: string,
): Promise<DecisionLine> {
    let found: DecisionLine | undefined;
    await expect
        .poll(
            () => {
                found = decisionsSince(path, since, guard)[0];
                return found !== undefined;
            },
            { message: `no authz_decide line for ${guard} after the action`, timeout: 20_000 },
        )
        .toBe(true);
    return found as DecisionLine;
}

/** Sign a registered user in through the real Auth.js browser flow. */
export async function signInUser(page: Page, email: string, password: string): Promise<void> {
    await page.goto("/auth/signin");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    const callback = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname === "/api/auth/callback/credentials" &&
            response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign In" }).click();
    expect((await callback).ok(), `${email} could not sign in`).toBe(true);
    await expect
        .poll(async () => {
            const response = await page.request.get("/api/auth/session");
            if (!response.ok()) return "";
            const body = (await response.json()) as { user?: { email?: string } };
            return body.user?.email ?? "";
        })
        .toBe(email);
}

/** stop-auth or start-auth of the ops live e2e auth stack script (the outage cell). */
export function stack(verb: "stop-auth" | "start-auth"): void {
    const script = process.env.LIVE_E2E_STACK_SCRIPT;
    const state = process.env.LIVE_E2E_STACK_STATE;
    if (!script || !state) {
        envFault(
            "LIVE_E2E_STACK_SCRIPT and LIVE_E2E_STACK_STATE name the ops auth stack script and its state directory",
        );
        return;
    }
    execFileSync("bash", [script, verb, state], { stdio: "pipe", timeout: 90_000 });
}

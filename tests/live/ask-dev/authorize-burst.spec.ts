import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

import { expect, test, type BrowserContext } from "@playwright/test";

import { EMAIL, OTHER_EMAIL, signIn, signInOther } from "./stack";

/**
 * CHAOS-12641: more than 10 silent authorizes in one minute through web, from two users. Web limits
 * one user to 6 per 60 s, so two users send 12 at once. Each request must answer 200 with a code and
 * the state back. ACR's side (12 authorize steps `ok`, no refusal) is counted from the acr-api logs
 * by the caller, between `BURST_START` and `BURST_END` printed here.
 *
 * Nothing here prints or stores a code, a state, a cookie or a password. A request that throws or
 * times out is a failure, never a skip.
 */
const PER_USER = 6;
const OUT = process.env.ASK_DEV_LIVE_BURST_OUT ?? "";

type Outcome = { readonly status: number; readonly hasCode: boolean; readonly stateBack: boolean };

const random43 = (): string => randomBytes(32).toString("base64url");

async function burst(context: BrowserContext): Promise<Outcome[]> {
    const page = await context.newPage();
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const pairs = Array.from({ length: PER_USER }, () => ({
        code_challenge: random43(),
        state: random43(),
    }));
    return page.evaluate(async (inputs) => {
        return Promise.all(
            inputs.map(async (body) => {
                const response = await fetch("/api/ask-dev/authorize", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                    signal: AbortSignal.timeout(30_000),
                });
                const json = (await response.json().catch(() => ({}))) as {
                    code?: unknown;
                    state?: unknown;
                };
                return {
                    status: response.status,
                    hasCode: typeof json.code === "string" && json.code !== "",
                    stateBack: json.state === body.state,
                };
            }),
        );
    }, pairs);
}

test("12 silent authorizes from 2 users in one minute all get a code", async ({ browser }) => {
    expect(
        OTHER_EMAIL,
        "ASK_DEV_LIVE_OTHER_EMAIL is not set: one user cannot send more than 6",
    ).not.toBe("");
    expect(OTHER_EMAIL).not.toBe(EMAIL);
    const first = await browser.newContext();
    const second = await browser.newContext();
    await signIn(await first.newPage());
    await signInOther(await second.newPage());

    const start = new Date();
    console.log(`BURST_START ${start.toISOString()}`);
    const [a, b] = await Promise.all([burst(first), burst(second)]);
    const end = new Date();
    console.log(`BURST_END ${end.toISOString()}`);

    const all = [...a, ...b];
    const summary = {
        start: start.toISOString(),
        end: end.toISOString(),
        count: all.length,
        ok: all.filter((o) => o.status === 200 && o.hasCode && o.stateBack).length,
        byStatus: all.reduce<Record<string, number>>((acc, o) => {
            acc[o.status] = (acc[o.status] ?? 0) + 1;
            return acc;
        }, {}),
    };
    console.log(`BURST_SUMMARY ${JSON.stringify(summary)}`);
    if (OUT !== "") writeFileSync(OUT, JSON.stringify(summary), { mode: 0o600 });

    expect(all).toHaveLength(2 * PER_USER);
    expect(end.getTime() - start.getTime(), "the burst took longer than one minute").toBeLessThan(
        60_000,
    );
    expect(summary.ok, `statuses: ${JSON.stringify(summary.byStatus)}`).toBe(2 * PER_USER);
});

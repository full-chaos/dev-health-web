import { writeFileSync } from "node:fs";
import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * CHAOS-9218: requests of one superuser that arrive together share ONE read of the impersonation
 * status, against the PRODUCTION build (`playwright.context-fabric.config.ts`).
 *
 * The web server keeps the status for 3 s for each process. Each test ENDS that keep itself (it
 * waits longer than the keep), so the result does not depend on the spec that ran before, and the
 * mock backend holds each status answer, so the requests are in flight together on any machine.
 */
const MOCK = `http://127.0.0.1:${process.env.CONTEXT_FABRIC_OPS_PORT ?? "8012"}`;
const STATUS_PATH = "/api/v1/admin/impersonate/status";
const KEEP_MS = 3_000;
const HOLD_MS = 400;

type Entry = { method: string; path: string; at: number };

/** The arrival times of the status reads the backend got since the last reset of its log. */
const statusReadTimes = async (request: APIRequestContext): Promise<number[]> =>
    ((await (await request.get(`${MOCK}/__test/backend-log`)).json()) as Entry[])
        .filter((entry) => entry.method === "GET" && entry.path === STATUS_PATH)
        .map((entry) => entry.at);

const holdStatus = (request: APIRequestContext, ms: number) =>
    request.post(`${MOCK}/__test/response-delay`, { data: { path: STATUS_PATH, ms } });

function record(name: string, value: unknown) {
    if (process.env.MEASURE_OUT) {
        writeFileSync(`${process.env.MEASURE_OUT}/${name}.json`, JSON.stringify(value, null, 2));
    }
}

test.describe("impersonation status read (production build)", () => {
    test.beforeEach(async ({ request }) => {
        await request.post(`${MOCK}/__test/entitlements`, {
            data: { scenario: "investment-enabled" },
        });
        await holdStatus(request, HOLD_MS);
    });
    test.afterEach(async ({ request }) => {
        await holdStatus(request, 0);
    });

    test("5 requests that arrive together after the keep has ended start 1 status read", async ({
        page,
        request,
    }) => {
        // The control: the session of this test is a superuser session that reads the status.
        expect((await page.request.get("/api/auth/session")).ok()).toBe(true);
        await page.waitForTimeout(KEEP_MS + 500);
        await request.post(`${MOCK}/__test/backend-log/reset`);

        const answers = await Promise.all(
            Array.from({ length: 5 }, () => page.request.get("/api/auth/session")),
        );

        for (const answer of answers) expect(answer.ok()).toBe(true);
        const reads = (await statusReadTimes(request)).length;
        record("together", { requests: answers.length, statusReads: reads });
        // 0 means the measurement did not happen (no superuser session, or the keep did not end).
        expect(reads, "status reads of 5 requests that arrive together").toBe(1);
    });

    test("a page load whose requests arrive just after the keep has ended starts 1 status read", async ({
        page,
        request,
    }) => {
        // The fault needs this order: the DOCUMENT request finds the status still kept, and the
        // requests the page then sends together find the keep ended. The test starts a keep at a
        // known time and loads the page a short time before its end. It tries a longer time
        // before the end until the order is the one it needs, and fails if no try had that order.
        const tries: { beforeEndMs: number; statusReads: number; afterDocument: boolean }[] = [];
        for (const beforeEndMs of [120, 250, 450, 800, 1_300]) {
            await page.waitForTimeout(KEEP_MS + 500);
            const keptAt = Date.now();
            expect((await page.request.get("/api/auth/session")).ok()).toBe(true);
            await page.waitForTimeout(Math.max(0, keptAt + KEEP_MS - beforeEndMs - Date.now()));
            await request.post(`${MOCK}/__test/backend-log/reset`);

            await page.goto("/investment?tab=overview", { waitUntil: "commit" });
            const documentAt = Date.now();
            await page.waitForLoadState("networkidle");
            await page.waitForTimeout(1_000);

            const reads = await statusReadTimes(request);
            const afterDocument = reads.length > 0 && reads.every((at) => at >= documentAt);
            tries.push({ beforeEndMs, statusReads: reads.length, afterDocument });
            if (afterDocument) break;
        }
        record("page-load", tries);

        const measured = tries.filter((entry) => entry.afterDocument);
        // No try with the needed order: the measurement did not happen, and that is a failure.
        expect(measured, `no try had the needed order: ${JSON.stringify(tries)}`).toHaveLength(1);
        expect(measured[0].statusReads, "status reads of one page load").toBe(1);
    });
});

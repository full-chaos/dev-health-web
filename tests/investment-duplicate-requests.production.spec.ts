import { writeFileSync } from "node:fs";
import { expect, test, type APIRequestContext } from "@playwright/test";

// CHAOS-9166: one load of the Investment page sends each (operation, variables) to the backend
// once. The mock backend logs every request (server render and browser) as operation + variables.
const MOCK = `http://127.0.0.1:${process.env.CONTEXT_FABRIC_OPS_PORT ?? "8012"}`;
const TABS = ["overview", "allocation", "evidence", "confidence"] as const;
const F_DEFAULT =
    "eyJob3ciOnt9LCJzY29wZSI6eyJpZHMiOltdLCJsZXZlbCI6InRlYW0ifSwidGltZSI6eyJjb21wYXJlX2RheXMiOjE0LCJyYW5nZV9kYXlzIjoxNH0sIndoYXQiOnt9LCJ3aG8iOnt9LCJ3aHkiOnt9fQ";
const F_OTHER =
    "eyJob3ciOnt9LCJzY29wZSI6eyJpZHMiOltdLCJsZXZlbCI6InRlYW0ifSwidGltZSI6eyJjb21wYXJlX2RheXMiOjE0LCJyYW5nZV9kYXlzIjo5MH0sIndoYXQiOnt9LCJ3aG8iOnt9LCJ3aHkiOnt9fQ";

type Entry = { method: string; path: string; operation: string; variables: string };

const readLog = async (request: APIRequestContext): Promise<Entry[]> =>
    (await request.get(`${MOCK}/__test/backend-log`)).json();

function group(log: Entry[]) {
    const counts = new Map<string, number>();
    for (const e of log) {
        const key = `${e.method} ${e.operation} ${e.variables}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
}

const CASES = TABS.flatMap((tab) => [undefined, F_DEFAULT, F_OTHER].map((f) => ({ tab, f })));

for (const { tab, f } of CASES) {
    const label = `${tab} f=${f === undefined ? "none" : f === F_DEFAULT ? "default" : "other"}`;
    test(`investment ${label} sends each identical read once`, async ({ page, request }) => {
        await request.post(`${MOCK}/__test/entitlements`, {
            data: { scenario: "investment-enabled" },
        });
        await request.post(`${MOCK}/__test/backend-log/reset`);
        const browserGraphql: string[] = [];
        page.on("request", (req) => {
            const url = new URL(req.url());
            if (url.pathname.startsWith("/graphql") || url.pathname.startsWith("/api/")) {
                browserGraphql.push(`${req.method()} ${url.pathname}`);
            }
        });
        const qs = new URLSearchParams({ tab });
        if (f) qs.set("f", f);
        await page.goto(`/investment?${qs.toString()}`);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(2500);

        const log = await readLog(request);
        const counts = group(log);
        const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        const report = {
            label,
            total: log.length,
            distinct: counts.size,
            browserRequests: browserGraphql.length,
            rows: rows.map(([key, n]) => ({ n, key: key.slice(0, 200) })),
        };
        if (process.env.MEASURE_OUT) {
            writeFileSync(
                `${process.env.MEASURE_OUT}/${label.replace(/[ =]/g, "_")}.json`,
                JSON.stringify(report, null, 2),
            );
        }
        const duplicates = rows.filter(([, n]) => n > 1);
        expect(
            duplicates.map(([key, n]) => `${n}x ${key.slice(0, 160)}`),
            `identical backend requests on ${label}`,
        ).toEqual([]);
    });
}

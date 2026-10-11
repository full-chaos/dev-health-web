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
        expect(heavyReads(log), `GraphQL reads of ${label}`).toEqual(NEEDED[tab]);
        const duplicates = rows.filter(([, n]) => n > 1);
        expect(
            duplicates.map(([key, n]) => `${n}x ${key.slice(0, 160)}`),
            `identical backend requests on ${label}`,
        ).toEqual([]);
    });
}

// CHAOS-9166: a tab starts only the reads it draws. `InvestmentFull` is the sankey flow: the
// team-category flow, its prior-window baseline, and the repo-team flow.
const HEAVY =
    /^graphql (InvestmentFull|InvestmentBreakdown|InvestmentEvidenceQuality|WorkUnitTeamAttributions)$/;
const NEEDED: Record<(typeof TABS)[number], Record<string, number>> = {
    overview: { InvestmentBreakdown: 1, InvestmentFull: 2 },
    allocation: { InvestmentFull: 3 },
    evidence: { InvestmentEvidenceQuality: 1, WorkUnitTeamAttributions: 1 },
    confidence: { InvestmentBreakdown: 1, InvestmentFull: 2 },
};

function heavyReads(log: Entry[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of log) {
        const match = HEAVY.exec(e.operation);
        if (match) out[match[1]] = (out[match[1]] ?? 0) + 1;
    }
    return out;
}

test("switching tabs starts the reads of the new tab once and never repeats a read", async ({
    page,
    request,
}) => {
    await request.post(`${MOCK}/__test/entitlements`, { data: { scenario: "investment-enabled" } });
    await request.post(`${MOCK}/__test/backend-log/reset`);
    await page.goto(`/investment?tab=overview&f=${F_DEFAULT}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    expect(heavyReads(await readLog(request))).toEqual(NEEDED.overview);

    await page.getByRole("tab", { name: "Allocation" }).click();
    await expect(page.getByTestId("investment-allocation")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    // Allocation adds only the baseline flow: the two flows of Overview are not asked again.
    expect(heavyReads(await readLog(request))).toEqual({
        InvestmentBreakdown: 1,
        InvestmentFull: 3,
    });

    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page.getByTestId("investment-overview")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    expect(heavyReads(await readLog(request))).toEqual({
        InvestmentBreakdown: 1,
        InvestmentFull: 3,
    });
});

// CHAOS-9230: one Allocation load is ONE wave of reads. Investment locks the scope to the team
// level; an `f` that names the organization level used to start a wave, then be rewritten by the
// scope bar and start a second wave (the first one cancelled when its answers were slow).
const F_ORG_LEVEL = Buffer.from(
    JSON.stringify({
        how: {},
        scope: { ids: [], level: "org" },
        time: { compare_days: 14, range_days: 14 },
        what: {},
        who: {},
        why: {},
    }),
).toString("base64url");

for (const [name, f] of [
    ["default", F_DEFAULT],
    ["org-level", F_ORG_LEVEL],
] as const) {
    test(`allocation load with a ${name} filter starts one wave of reads`, async ({
        page,
        request,
    }) => {
        await request.post(`${MOCK}/__test/entitlements`, {
            data: { scenario: "investment-enabled" },
        });
        await request.post(`${MOCK}/__test/backend-log/reset`);
        const seen: { op: string; start: number; fate: string; level: string }[] = [];
        const open = new Map<object, (typeof seen)[number]>();
        const t0 = Date.now();
        page.on("request", (req) => {
            const url = new URL(req.url());
            if (url.pathname !== "/graphql") return;
            const op = /(?:query|mutation)\s+(\w+)/.exec(url.searchParams.get("query") ?? "")?.[1];
            const variables = JSON.parse(url.searchParams.get("variables") ?? "{}");
            const level = String(variables.batch?.filters?.scope?.level ?? "none");
            const entry = { op: op ?? "?", start: Date.now() - t0, fate: "open", level };
            open.set(req, entry);
            seen.push(entry);
        });
        page.on("requestfinished", (req) => {
            const entry = open.get(req);
            if (entry) entry.fate = "finished";
        });
        page.on("requestfailed", (req) => {
            const entry = open.get(req);
            if (entry) entry.fate = "failed";
        });
        await page.goto(`/investment?tab=allocation&f=${f}`);
        await expect(page.getByTestId("investment-allocation")).toBeVisible();
        await page.waitForLoadState("networkidle");
        // Time for a second wave, were there one: the scope bar rewrites the URL after hydration.
        await page.waitForTimeout(2500);

        expect(seen.map((r) => r.op)).toEqual([
            "InvestmentFull",
            "InvestmentFull",
            "InvestmentFull",
        ]);
        expect(seen.map((r) => r.fate)).toEqual(["finished", "finished", "finished"]);
        // One wave: the three reads start together, none after a URL rewrite.
        const starts = seen.map((r) => r.start);
        expect(Math.max(...starts) - Math.min(...starts)).toBeLessThan(250);
        // The first wave carries the final variables: the team scope the page settles on.
        expect(seen.map((r) => r.level)).toEqual(["TEAM", "TEAM", "TEAM"]);
        // The URL settles on the same filter as before: the team level, no ids.
        const finalF = new URL(page.url()).searchParams.get("f") ?? "";
        expect(JSON.parse(Buffer.from(finalF, "base64url").toString()).scope).toEqual({
            ids: [],
            level: "team",
        });
        expect(heavyReads(await readLog(request))).toEqual({ InvestmentFull: 3 });
    });
}

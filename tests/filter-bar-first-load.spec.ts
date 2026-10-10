import { expect, test } from "@playwright/test";

// CHAOS-9130: one first load of a filter-bar page is one server render. The default `f` is written
// with no navigation, so the page makes one document request, no RSC request, and one set of
// backend reads.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const PAGES = ["/code", "/explore"];

const backendCount = async (request: import("@playwright/test").APIRequestContext) =>
    ((await (await request.get(`${MOCK}/__test/backend-requests`)).json()) as { count: number })
        .count;

for (const path of PAGES) {
    for (const withF of [false, true]) {
        test(`first load of ${path} ${withF ? "with" : "without"} f renders once`, async ({
            page,
            request,
        }) => {
            let documents = 0;
            let rsc = 0;
            page.on("request", (req) => {
                const url = new URL(req.url());
                if (url.pathname !== path) return;
                if (req.headers()["rsc"] === "1" || url.searchParams.has("_rsc")) rsc += 1;
                else if (req.resourceType() === "document") documents += 1;
            });
            const before = await backendCount(request);
            const f = withF ? "?f=eyJzY29wZSI6eyJsZXZlbCI6Im9yZyIsImlkcyI6W119fQ" : "";
            await page.goto(`${path}${f}`);
            await page.waitForLoadState("networkidle");
            await page.waitForTimeout(2000);
            const backend = (await backendCount(request)) - before;
            console.log(
                `MEASURE ${path} f=${withF} documents=${documents} rsc=${rsc} backend=${backend}`,
            );
            expect(documents).toBe(1);
            expect(rsc).toBe(0);
            if (!withF) expect(new URL(page.url()).searchParams.get("f")).not.toBeNull();
        });
    }
}

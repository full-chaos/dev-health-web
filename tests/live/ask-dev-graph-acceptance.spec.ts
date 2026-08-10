/**
 * Production-shaped graph routing acceptance. This suite intentionally has no
 * route interception, mock server, or provider override: a missing Compose
 * backend, entitlement, graph result, or completion signal is a failure.
 */
import { expect, test, type Page } from "@playwright/test";

import { signInCanonicalUser } from "./helpers";

type JsonObject = Record<string, unknown>;
type Sse = { name: string; data: JsonObject };

const required = (name: string): string => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is required; no graph measurement may be skipped.`);
    return value;
};

const graphQuestion = required("ASK_DEV_GRAPH_ACCEPTANCE_QUESTION");
const fallbackQuestion = required("ASK_DEV_GRAPH_ACCEPTANCE_FALLBACK_QUESTION");
const ambiguousQuestion = required("ASK_DEV_GRAPH_ACCEPTANCE_AMBIGUOUS_QUESTION");
const expectedGraphState = required("ASK_DEV_GRAPH_ACCEPTANCE_EXPECTED_GRAPH_STATE");
const expectedFallbackState = required("ASK_DEV_GRAPH_ACCEPTANCE_EXPECTED_FALLBACK_STATE");
const backendSha = required("ASK_DEV_GRAPH_ACCEPTANCE_BACKEND_SHA");

function parseSse(body: string): Sse[] {
    const frames = body.split(/\r?\n\r?\n/u).filter((frame) => frame.trim());
    expect(
        frames,
        "The real Ops stream must produce at least one completion frame.",
    ).not.toHaveLength(0);
    return frames.map((frame) => {
        const eventLine = frame.split(/\r?\n/u).find((line) => line.startsWith("event: "));
        const data = frame
            .split(/\r?\n/u)
            .filter((line) => line.startsWith("data: "))
            .map((line) => line.slice(6))
            .join("\n");
        expect(eventLine, `Malformed SSE frame: ${frame}`).toBeDefined();
        expect(data, `SSE frame has no data: ${frame}`).not.toBe("");
        const parsed = JSON.parse(data) as JsonObject;
        expect(parsed.schema_version).toBe("dev_stream_event.v1");
        expect(parsed.event).toBe(eventLine!.slice(7));
        return { name: eventLine!.slice(7), data: parsed };
    });
}

function assertTerminalStream(events: Sse[]): JsonObject {
    const names = events.map((event) => event.name);
    expect(names.filter((name) => name === "run.started")).toHaveLength(1);
    expect(names.filter((name) => name === "answer.completed")).toHaveLength(1);
    expect(names.filter((name) => name === "done")).toHaveLength(1);
    expect(names).not.toContain("error");
    const runIds = new Set(events.map((event) => event.data.run_id).filter(Boolean));
    expect(runIds.size, "All stream events must belong to one backend run.").toBe(1);
    return events.find((event) => event.name === "answer.completed")!.data;
}

function assertNoInternalTokens(text: string): void {
    expect(text).not.toMatch(
        /\b(?:graph_assisted|Graphiti|Cypher|canonical_enrichment|resolved_scope)\b/iu,
    );
}

function assertNarrativeSafe(value: unknown): void {
    if (typeof value === "string") {
        assertNoInternalTokens(value);
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) assertNarrativeSafe(item);
        return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
        // Contract keys such as graph_assisted/resolved_scope are explicitly
        // allowed; only their user-facing narrative fields are scanned.
        if (
            [
                "direct_summary",
                "text",
                "label",
                "safe_message",
                "title",
                "warning",
                "question",
                "summary",
            ].includes(key)
        ) {
            assertNarrativeSafe(child);
        } else if (typeof child === "object") {
            assertNarrativeSafe(child);
        }
    }
}

async function armCapture(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const target = window as Window & { __graphSse?: string[] };
        // Preserve captured bodies across client-side navigation/reconnect.
        target.__graphSse ??= [];
        const nativeFetch = window.fetch.bind(window);
        window.fetch = async (...args) => {
            const response = await nativeFetch(...args);
            const input = args[0];
            const url = new URL(
                typeof input === "string" ? input : input instanceof URL ? input : input.url,
                location.href,
            );
            const method = (
                args[1]?.method ?? (input instanceof Request ? input.method : "GET")
            ).toUpperCase();
            if (
                method === "POST" &&
                /^\/api\/v1\/dev\/conversations\/[^/]+\/messages$/u.test(url.pathname)
            ) {
                void response
                    .clone()
                    .text()
                    .then((body) => target.__graphSse?.push(body));
            }
            return response;
        };
    });
}

async function submit(page: Page, question: string, regionName = "Ask Dev"): Promise<JsonObject> {
    const region = page.getByRole("region", { name: regionName });
    const before = await page.evaluate(
        () => (window as Window & { __graphSse?: string[] }).__graphSse?.length ?? 0,
    );
    const composer = region.getByRole("textbox", { name: "Ask Dev question" });
    await composer.fill(question);
    await region.getByRole("button", { name: "Ask", exact: true }).click();
    // Compact /diagnose has no New conversation control; the rendered answer
    // is the surface-specific completion signal.
    await expect(region.getByRole("article", { name: "Ask Dev answer" })).toBeVisible({
        timeout: 100_000,
    });
    await page.waitForFunction(
        (minimum) =>
            ((window as Window & { __graphSse?: string[] }).__graphSse?.length ?? 0) > minimum,
        before,
    );
    const body = await page.evaluate(
        (index) => (window as Window & { __graphSse?: string[] }).__graphSse?.[index] ?? "",
        before,
    );
    expect(body, "The browser must capture the complete real SSE response.").not.toBe("");
    return assertTerminalStream(parseSse(body));
}

async function openSurface(page: Page, route: string): Promise<void> {
    await page.goto(route);
    const open = page.getByRole("button", { name: "Open Ask Dev" });
    if (await open.count()) await open.click();
    await expect(page.getByRole("region", { name: "Ask Dev" })).toBeVisible();
}

test("graph route, canonical fallback, ambiguity refusal, and continuity are measured", async ({
    page,
}, testInfo) => {
    testInfo.annotations.push({ type: "backend", description: backendSha });
    const devPostUrls: string[] = [];
    const consoleLines: string[] = [];
    page.on("request", (request) => {
        const path = new URL(request.url()).pathname;
        if (
            request.method() === "POST" &&
            /^\/api\/v1\/dev\/conversations(?:\/[^/]+\/messages)?$/u.test(path)
        ) {
            devPostUrls.push(path);
        }
    });
    page.on("console", (message) => consoleLines.push(message.text()));
    await armCapture(page);
    await signInCanonicalUser(page);
    const capabilitiesResponse = await page.request.get("/api/v1/dev/capabilities");
    expect(capabilitiesResponse.ok()).toBe(true);
    const capabilities = (await capabilitiesResponse.json()) as JsonObject;
    const runtimeSha =
        capabilities.backend_sha ??
        capabilities.build_sha ??
        capabilities.commit_sha ??
        capabilitiesResponse.headers()["x-backend-sha"];
    expect(
        runtimeSha,
        "Backend SHA must be returned by runtime, not self-attested by env.",
    ).toBeTruthy();
    expect(runtimeSha).toBe(backendSha);
    expect(capabilities.ask_dev).toBe(true);
    expect(capabilities.readiness).toBe("ready");
    expect(capabilities.ask_dev_graph_routing).toBe(true);

    await openSurface(page, "/diagnose");
    const graph = await submit(page, graphQuestion);
    const graphAnswer = (graph.answer ?? graph) as JsonObject;
    const graphAssisted = graphAnswer.graph_assisted as JsonObject | null | undefined;
    expect(
        graphAssisted,
        "The graph question must return the graph contribution object.",
    ).toBeTruthy();
    expect(graphAssisted!.state).toBe(expectedGraphState);
    expect(typeof graphAnswer.direct_summary).toBe("string");
    expect(String(graphAnswer.direct_summary)).not.toBe("");
    assertNoInternalTokens(String(graphAnswer.direct_summary));
    assertNarrativeSafe(graph);
    const firstRun = graph.run_id;
    const firstFrame = graphAnswer.answer_id;
    expect(typeof firstRun).toBe("string");
    expect(typeof firstFrame).toBe("string");
    const graphPostCount = devPostUrls.length;
    await page
        .getByRole("region", { name: "Ask Dev" })
        .getByRole("link", { name: "Ask Dev workspace" })
        .click();
    await expect(page).toHaveURL(/\/dev(?:\?|$)/u);
    const workspace = page.getByRole("region", { name: "Ask Dev workspace" });
    await expect(workspace.getByLabel("Ask Dev transcript")).toBeVisible();
    const retained = await workspace.getByLabel("Ask Dev transcript").innerText();
    expect(retained).toContain(String(graphAnswer.direct_summary));
    assertNoInternalTokens(retained);
    expect(devPostUrls).toHaveLength(graphPostCount);
    expect(devPostUrls).toHaveLength(2);
    const transcriptResponse = await page.request.get(
        `/api/v1/dev/conversations/${encodeURIComponent(String(graphAnswer.conversation_id))}/transcript`,
    );
    expect(transcriptResponse.ok()).toBe(true);
    const transcript = (await transcriptResponse.json()) as JsonObject;
    const assistant = (transcript.items as JsonObject[]).find((item) => item.role === "assistant");
    expect(assistant?.run_id, "Persisted frame must retain the exact run id.").toBe(firstRun);
    expect(
        (assistant?.answer as JsonObject | undefined)?.answer_id,
        "Persisted frame must retain the exact answer id.",
    ).toBe(firstFrame);
    expect(firstRun).toBeTruthy();

    await workspace.getByRole("button", { name: "New conversation" }).click();
    const fallback = await submit(page, fallbackQuestion, "Ask Dev workspace");
    const fallbackAnswer = (fallback.answer ?? fallback) as JsonObject;
    const fallbackGraph = fallbackAnswer.graph_assisted as JsonObject | null | undefined;
    expect(
        fallbackGraph,
        "Fallback must be explicit, not a blank or skipped measurement.",
    ).toBeTruthy();
    expect(fallbackGraph!.state).toBe(expectedFallbackState);
    expect(String(fallbackAnswer.direct_summary ?? "")).not.toBe("");
    assertNoInternalTokens(String(fallbackAnswer.direct_summary ?? ""));
    assertNarrativeSafe(fallback);
    assertNoInternalTokens(await workspace.getByLabel("Ask Dev transcript").innerText());

    await workspace.getByRole("button", { name: "New conversation" }).click();
    const ambiguous = await submit(page, ambiguousQuestion);
    const ambiguousAnswer = (ambiguous.answer ?? ambiguous) as JsonObject;
    const scope = ambiguousAnswer.resolved_scope as JsonObject | undefined;
    expect(scope?.outcome).toBe("ambiguous");
    expect(Array.isArray(scope?.candidates)).toBe(true);
    expect((scope?.candidates as unknown[]).length).toBeGreaterThan(1);
    expect(
        scope?.resolved_scope ?? null,
        "Ambiguity must not commit a first candidate.",
    ).toBeNull();
    expect(ambiguousAnswer.graph_assisted ?? null).toBeNull();
    assertNoInternalTokens(String(ambiguousAnswer.direct_summary ?? ""));
    assertNarrativeSafe(ambiguous);
    assertNoInternalTokens(await workspace.getByLabel("Ask Dev transcript").innerText());
    for (const line of consoleLines) assertNoInternalTokens(line);
    await testInfo.attach("graph-acceptance-summary.json", {
        body: JSON.stringify(
            {
                backendSha,
                graphState: graphAssisted!.state,
                fallbackState: fallbackGraph!.state,
                ambiguous: scope?.outcome,
            },
            null,
            2,
        ),
        contentType: "application/json",
    });
});

/**
 * Canonical Ask Dev full-stack acceptance.
 *
 * This spec deliberately uses the real browser session, versioned same-origin
 * BFF, Ops REST/SSE router, persistence, scope resolver, and deterministic
 * OpenAI-compatible acceptance provider. Do not replace those boundaries with
 * route interception, MSW, or an Ops dependency override.
 */
import { expect, test, type Page, type Request } from "@playwright/test";

import { authHeaders, liveBackendUrl, loginUser, signInCanonicalUser } from "./helpers";

const QUESTION = requiredEnv("ASK_DEV_ACCEPTANCE_QUESTION");
const EXPECTED_MODEL = "ask-dev-scripted-v1";
const RENAMED_TITLE = "Grounded delivery trend";
const EXPECTED_METRIC_ID = requiredEnv("ASK_DEV_ACCEPTANCE_EXPECTED_METRIC_ID");
const EXPECTED_EVIDENCE_FRAGMENT = requiredEnv("ASK_DEV_ACCEPTANCE_EXPECTED_EVIDENCE_FRAGMENT");
const EXPECTED_CLAIM_KIND = requiredEnv("ASK_DEV_ACCEPTANCE_EXPECTED_CLAIM_KIND");

type JsonObject = Record<string, unknown>;

type ParsedSseEvent = Readonly<{
    name: string;
    data: JsonObject;
}>;

function requiredEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is required for Ask Dev acceptance.`);
    return value;
}

function pathname(request: Request): string {
    return new URL(request.url()).pathname;
}

function parseSse(body: string): ParsedSseEvent[] {
    return body
        .split(/\r?\n\r?\n/u)
        .filter((frame) => frame.trim().length > 0)
        .map((frame) => {
            const lines = frame.split(/\r?\n/u);
            const eventLine = lines.find((line) => line.startsWith("event: "));
            const dataLines = lines
                .filter((line) => line.startsWith("data: "))
                .map((line) => line.slice("data: ".length));
            expect(eventLine, `SSE frame is missing an event name: ${frame}`).toBeDefined();
            expect(dataLines, `SSE frame is missing data: ${frame}`).not.toHaveLength(0);
            const name = eventLine!.slice("event: ".length);
            const data = JSON.parse(dataLines.join("\n")) as JsonObject;
            expect(data.schema_version).toBe("dev_stream_event.v1");
            expect(data.event).toBe(name);
            return { name, data };
        });
}

async function acceptanceAdmin(page: Page): Promise<{ orgId: string; token: string }> {
    const login = await loginUser(
        page.request,
        process.env.TEST_SUPERUSER_EMAIL ?? "admin@devhealth.example",
        process.env.TEST_SUPERUSER_PASSWORD ?? "devhealth123",
    );
    const user = login.user as JsonObject | undefined;
    expect(typeof login.access_token).toBe("string");
    expect(typeof user?.org_id).toBe("string");
    return { orgId: user!.org_id as string, token: login.access_token as string };
}

async function updateAskDevPolicy(
    page: Page,
    identity: { orgId: string; token: string },
    patch: JsonObject,
): Promise<JsonObject> {
    const response = await page.request.patch(`${liveBackendUrl}/api/v1/admin/ask-dev/settings`, {
        data: patch,
        headers: { ...authHeaders(identity.token), "X-Org-Id": identity.orgId },
    });
    const body = (await response.json()) as JsonObject;
    expect(response.ok(), `Ask Dev policy update failed: ${JSON.stringify(body)}`).toBe(true);
    return body;
}

async function signInUser(page: Page, email: string, password: string): Promise<void> {
    await page.goto("/auth/signin");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    const callback = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname === "/api/auth/callback/credentials" &&
            response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign In" }).click();
    expect((await callback).ok()).toBe(true);
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/u);
}

test("permanent contextual window continues one grounded run in /dev without duplicate execution", async ({
    page,
}, testInfo) => {
    await page.addInitScript(() => {
        const acceptanceWindow = window as Window & {
            __askDevSseBodies?: string[];
            __askDevSseCaptureErrors?: string[];
        };
        acceptanceWindow.__askDevSseBodies = [];
        acceptanceWindow.__askDevSseCaptureErrors = [];
        const nativeFetch = window.fetch.bind(window);
        window.fetch = async (...args) => {
            const response = await nativeFetch(...args);
            const input = args[0];
            const init = args[1];
            const url =
                typeof input === "string"
                    ? new URL(input, window.location.href)
                    : input instanceof URL
                      ? input
                      : new URL(input.url, window.location.href);
            const method = (
                init?.method ?? (input instanceof Request ? input.method : "GET")
            ).toUpperCase();
            if (
                method === "POST" &&
                /^\/api\/v1\/dev\/conversations\/[^/]+\/messages$/u.test(url.pathname)
            ) {
                void response
                    .clone()
                    .text()
                    .then((body) => acceptanceWindow.__askDevSseBodies?.push(body))
                    .catch((error: unknown) =>
                        acceptanceWindow.__askDevSseCaptureErrors?.push(String(error)),
                    );
            }
            return response;
        };
    });

    const conversationPosts: Request[] = [];
    const messagePosts: Request[] = [];
    page.on("request", (request) => {
        if (request.method() !== "POST") return;
        const path = pathname(request);
        if (path === "/api/v1/dev/conversations") conversationPosts.push(request);
        if (/^\/api\/v1\/dev\/conversations\/[^/]+\/messages$/u.test(path)) {
            messagePosts.push(request);
        }
    });

    await signInCanonicalUser(page);

    const capabilitiesResponse = await page.request.get("/api/v1/dev/capabilities");
    expect(
        capabilitiesResponse.ok(),
        "Ask Dev capabilities must be reachable through the BFF.",
    ).toBe(true);
    const capabilities = (await capabilitiesResponse.json()) as JsonObject;
    expect(capabilities).toMatchObject({
        schema_version: "dev_capabilities.v1",
        ask_dev: true,
        agent_context_runtime: false,
        can_read: true,
        contextual_entrypoints: true,
        evidence_resolver: true,
        readiness: "ready",
        effective_model_label: EXPECTED_MODEL,
    });

    await page.goto("/data-health");
    await expect(page.getByRole("button", { name: "Ask Dev about this" })).toHaveCount(0);
    await page.getByRole("button", { name: "Open Ask Dev" }).click();

    const permanentWindow = page.getByRole("region", { name: "Ask Dev" });
    await expect(permanentWindow).toBeVisible();
    // CHAOS-3524: the persistent scope bar (which used to echo the ambient
    // "Data Confidence" label here) is gone — dashboard chrome that doesn't
    // belong in an LLM chat surface, per chris's design ruling. This route's
    // ambient context is an implicit, un-registered label with no display
    // affordance anymore (only a genuine registered proposal gets the small
    // "Scoped to ..." chip now — not the case here). The load-bearing proof
    // that /data-health's implicit context is actually applied is the
    // request-payload assertion further down (`surface_context.route_id:
    // "data_health"`), which is unaffected by this display change.
    const composer = permanentWindow.getByRole("textbox", { name: "Ask Dev question" });
    await expect(composer).toHaveValue("");
    expect(
        conversationPosts,
        "Opening a typed contextual entry point must not create a conversation.",
    ).toHaveLength(0);
    expect(
        messagePosts,
        "Opening a typed contextual entry point must not submit a run.",
    ).toHaveLength(0);

    const suggestedQuestion = "What changed in this scope during the selected time range?";
    await permanentWindow.getByRole("button", { name: suggestedQuestion }).click();
    await expect(composer).toHaveValue(suggestedQuestion);
    expect(conversationPosts, "Selecting a suggested question must not auto-submit.").toHaveLength(
        0,
    );
    expect(messagePosts, "Selecting a suggested question must not auto-submit.").toHaveLength(0);

    await composer.fill(QUESTION);
    await expect(composer).toHaveValue(QUESTION);

    const createResponsePromise = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname === "/api/v1/dev/conversations" &&
            response.request().method() === "POST",
    );
    const messageResponsePromise = page.waitForResponse(
        (response) =>
            /^\/api\/v1\/dev\/conversations\/[^/]+\/messages$/u.test(
                new URL(response.url()).pathname,
            ) && response.request().method() === "POST",
    );
    await permanentWindow.getByRole("button", { name: "Ask", exact: true }).click();

    const createResponse = await createResponsePromise;
    expect(createResponse.ok(), "The versioned conversation BFF request failed.").toBe(true);
    const created = (await createResponse.json()) as JsonObject;
    expect(created.schema_version).toBe("dev_conversation.v1");
    const conversationId = created.conversation_id;
    expect(typeof conversationId).toBe("string");
    expect(conversationId).not.toBe("");
    expect(created.retention_days).toBe(30);
    expect(
        Date.parse(created.expires_at as string) - Date.parse(created.created_at as string),
    ).toBe(30 * 24 * 60 * 60 * 1000);

    const messageResponse = await messageResponsePromise;
    expect(messageResponse.ok(), "The versioned message/SSE BFF request failed.").toBe(true);
    expect(messageResponse.headers()["content-type"]).toContain("text/event-stream");
    const messagePath = new URL(messageResponse.url()).pathname;
    expect(decodeURIComponent(messagePath)).toBe(
        `/api/v1/dev/conversations/${conversationId as string}/messages`,
    );

    expect(conversationPosts).toHaveLength(1);
    expect(messagePosts).toHaveLength(1);
    const submitted = messagePosts[0]!.postDataJSON() as JsonObject;
    expect(submitted).toMatchObject({
        schema_version: "dev_message_request.v1",
        conversation_id: conversationId,
        question: QUESTION,
        question_class: "investigation",
        scope: {
            surface_context: {
                route_id: "data_health",
                entity_refs: [],
            },
        },
    });

    await page.waitForFunction(() => {
        const acceptanceWindow = window as Window & {
            __askDevSseBodies?: string[];
            __askDevSseCaptureErrors?: string[];
        };
        return (
            (acceptanceWindow.__askDevSseBodies?.length ?? 0) === 1 ||
            (acceptanceWindow.__askDevSseCaptureErrors?.length ?? 0) > 0
        );
    });
    const capture = await page.evaluate(() => {
        const acceptanceWindow = window as Window & {
            __askDevSseBodies?: string[];
            __askDevSseCaptureErrors?: string[];
        };
        return {
            bodies: acceptanceWindow.__askDevSseBodies ?? [],
            errors: acceptanceWindow.__askDevSseCaptureErrors ?? [],
        };
    });
    expect(capture.errors, "The browser-native SSE observer failed.").toEqual([]);
    expect(capture.bodies, "Exactly one browser SSE body must be observed.").toHaveLength(1);
    const events = parseSse(capture.bodies[0]!);
    const eventNames = events.map((event) => event.name);
    expect(eventNames.filter((name) => name === "run.started")).toHaveLength(1);
    expect(eventNames.filter((name) => name === "answer.completed")).toHaveLength(1);
    expect(eventNames.filter((name) => name === "done")).toHaveLength(1);
    expect(eventNames).not.toContain("error");
    expect(eventNames[0]).toBe("run.started");
    expect(eventNames.at(-1)).toBe("done");
    expect(events.map((event) => event.data.sequence)).toEqual(
        events.map((_, sequence) => sequence),
    );

    const runIds = new Set(events.map((event) => event.data.run_id));
    expect(runIds.size, "Every SSE frame must belong to one run.").toBe(1);
    const runId = [...runIds][0];
    expect(typeof runId).toBe("string");
    expect(runId).not.toBe("");

    const completed = events.find((event) => event.name === "answer.completed")!.data;
    const answer = completed.answer as JsonObject;
    const metrics = answer.metrics as JsonObject[];
    const evidence = answer.evidence as JsonObject[];
    const claims = answer.claims as JsonObject[];
    const completedMetric = metrics.find((metric) => metric.metric_id === EXPECTED_METRIC_ID);
    expect(
        completedMetric,
        `The answer must use the registered ${EXPECTED_METRIC_ID} metric.`,
    ).toBeDefined();
    const currentValue = completedMetric!.value;
    const comparisonValue = completedMetric!.comparison_value;
    expect(typeof currentValue).toBe("number");
    expect(typeof comparisonValue).toBe("number");
    const direction =
        (currentValue as number) > (comparisonValue as number)
            ? "increased"
            : (currentValue as number) < (comparisonValue as number)
              ? "decreased"
              : "was unchanged";
    const expectedSummary = `Completed work ${direction} from ${comparisonValue as number} to ${currentValue as number} items in the selected time range.`;
    expect(answer).toMatchObject({
        schema_version: "dev_answer.v1",
        conversation_id: conversationId,
        status: "partial",
        direct_summary: expectedSummary,
        coverage: {
            required_source_count: 3,
            available_source_count: 3,
            unavailable_required_sources: [],
            stale_required_sources: [],
        },
    });
    expect(answer.warnings).toContain("Provider health was measured through data_health.v1.");
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({
        kind: EXPECTED_CLAIM_KIND,
        text: expectedSummary,
        confidence: 1,
        metric_ref_ids: [completedMetric!.metric_ref_id],
    });
    expect(Array.isArray(answer.metrics)).toBe(true);
    expect(Array.isArray(answer.evidence)).toBe(true);
    expect(
        metrics.length,
        "The grounded acceptance answer must include registered metric refs.",
    ).toBeGreaterThan(0);
    expect(
        evidence.length,
        "The grounded acceptance answer must include evidence refs.",
    ).toBeGreaterThan(0);
    expect(
        metrics.every(
            (metric) => typeof metric.metric_ref_id === "string" && metric.metric_ref_id.length > 0,
        ),
    ).toBe(true);
    expect(
        evidence.every(
            (item) => typeof item.evidence_ref_id === "string" && item.evidence_ref_id.length > 0,
        ),
    ).toBe(true);
    const repositoryEvidence = evidence.find((item) =>
        String(item.entity_id).includes(EXPECTED_EVIDENCE_FRAGMENT),
    );
    expect(
        repositoryEvidence,
        `The claim must cite seeded ${EXPECTED_EVIDENCE_FRAGMENT} evidence.`,
    ).toBeDefined();
    expect(claims[0]!.evidence_ref_ids).toEqual([repositoryEvidence!.evidence_ref_id]);

    // Citation ordinals and detail-panel anchors are DERIVED from the payload,
    // never assumed (CHAOS-3435). `answer.evidence` carries no ordering
    // contract -- it is first-seen assembly order across tool results, and the
    // upstream evidence search deliberately ranks by relevance/source
    // precedence/freshness, so a cited ref legitimately lands at any index.
    // The UI numbers a citation by the cited ref's index in `answer.evidence`
    // (E{index+1}) and scopes the detail-panel id per answer
    // (`ask-dev-evidence-${answer_id}-${index+1}`, CHAOS-3215 M6).
    const answerId = answer.answer_id;
    expect(
        typeof answerId,
        "answer.answer_id scopes every citation anchor id (CHAOS-3215 M6).",
    ).toBe("string");
    expect(answerId as string).not.toBe("");

    const citedEvidenceRefId = (claims[0]!.evidence_ref_ids as string[])[0]!;
    const citedEvidenceIndex = evidence.findIndex(
        (item) => item.evidence_ref_id === citedEvidenceRefId,
    );
    expect(
        citedEvidenceIndex,
        "The claim's cited evidence ref must resolve inside answer.evidence.",
    ).toBeGreaterThanOrEqual(0);
    const evidenceOrdinal = citedEvidenceIndex + 1;

    const citedMetricRefId = (claims[0]!.metric_ref_ids as string[])[0]!;
    const citedMetricIndex = metrics.findIndex(
        (metric) => metric.metric_ref_id === citedMetricRefId,
    );
    expect(
        citedMetricIndex,
        "The claim's cited metric ref must resolve inside answer.metrics.",
    ).toBeGreaterThanOrEqual(0);
    const metricOrdinal = citedMetricIndex + 1;

    const done = events.find((event) => event.name === "done")!.data;
    expect(done).toMatchObject({ run_id: runId, terminal_kind: "answer" });

    const permanentAnswer = permanentWindow.getByRole("article", { name: "Ask Dev answer" });
    await expect(permanentAnswer).toContainText(expectedSummary);
    const expansionResponsePromise = page.waitForResponse(
        (response) =>
            /^\/api\/v1\/dev\/evidence\/[^/]+$/u.test(new URL(response.url()).pathname) &&
            response.request().method() === "GET",
    );
    await permanentAnswer
        .getByRole("button", {
            name: `Open evidence citation ${evidenceOrdinal} for claim`,
            exact: true,
        })
        .click();
    expect((await expansionResponsePromise).ok(), "Authorized evidence expansion failed.").toBe(
        true,
    );
    // Attribute selector, not `#id`: answer ids are opaque and need not be
    // valid bare CSS identifiers.
    await expect(
        page.locator(`[id="ask-dev-evidence-${answerId as string}-${evidenceOrdinal}"]`),
    ).toContainText(/available/u);
    await permanentAnswer
        .getByRole("button", {
            name: `Open metric citation ${metricOrdinal} for claim`,
            exact: true,
        })
        .click();
    await expect(
        page.locator(`[id="ask-dev-metric-${answerId as string}-${metricOrdinal}"] details`),
    ).toHaveAttribute("open", "");
    await page.screenshot({
        path: testInfo.outputPath("ask-dev-permanent-window-grounded-answer.png"),
        fullPage: true,
    });
    await permanentWindow.getByRole("link", { name: "Ask Dev workspace" }).click();
    await expect(page).toHaveURL(/\/dev(?:\?|$)/u);
    const workspace = page.getByRole("region", { name: "Ask Dev workspace" });
    const workspaceTranscript = workspace.getByLabel("Ask Dev transcript");
    await expect(workspace).toBeVisible();
    await expect(workspaceTranscript.getByText(QUESTION, { exact: true })).toBeVisible();
    await expect(workspace.getByRole("article", { name: "Ask Dev answer" })).toContainText(
        expectedSummary,
    );
    await page.screenshot({
        path: testInfo.outputPath("ask-dev-workspace-continuity.png"),
        fullPage: true,
    });
    expect(
        conversationPosts,
        "Client navigation must not create another conversation.",
    ).toHaveLength(1);
    expect(messagePosts, "Client navigation must not execute another run.").toHaveLength(1);

    await workspace.getByRole("link", { name: "Return to Ask Dev window" }).click();
    await expect(page).toHaveURL(/\/data-health(?:\?|$)/u);
    await expect(permanentWindow).toBeVisible();
    await expect(permanentWindow.getByRole("article", { name: "Ask Dev answer" })).toContainText(
        expectedSummary,
    );
    expect(
        conversationPosts,
        "Returning to the permanent window must not create a run.",
    ).toHaveLength(1);
    expect(messagePosts, "Returning to the permanent window must not execute a run.").toHaveLength(
        1,
    );
    await permanentWindow.getByRole("link", { name: "Ask Dev workspace" }).click();
    await expect(page).toHaveURL(/\/dev(?:\?|$)/u);

    const transcriptResponse = await page.request.get(
        `/api/v1/dev/conversations/${encodeURIComponent(conversationId as string)}/transcript`,
    );
    expect(
        transcriptResponse.ok(),
        "The persisted transcript must be readable through the BFF.",
    ).toBe(true);
    const transcript = (await transcriptResponse.json()) as JsonObject;
    expect(transcript).toMatchObject({
        schema_version: "dev_conversation_transcript.v1",
        conversation_id: conversationId,
        next_cursor: null,
    });
    const items = transcript.items as JsonObject[];
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.role)).toEqual(["user", "assistant"]);
    expect(items.map((item) => item.run_id)).toEqual([runId, runId]);
    expect(items[0]).toMatchObject({ question: QUESTION, run_state: "completed" });
    expect(items[1]).toMatchObject({
        question: null,
        run_state: "completed",
        answer: { direct_summary: expectedSummary, conversation_id: conversationId },
    });

    const retainedListResponse = await page.request.get("/api/v1/dev/conversations");
    expect(retainedListResponse.ok(), "The retained conversation list must be readable.").toBe(
        true,
    );
    const retainedList = (await retainedListResponse.json()) as JsonObject;
    const retainedRecord = (retainedList.items as JsonObject[]).find(
        (item) => item.conversation_id === conversationId,
    );
    expect(retainedRecord, "The exact conversation must remain in retained history.").toBeDefined();
    const retainedTitle = retainedRecord!.title;
    expect(typeof retainedTitle).toBe("string");
    expect(retainedTitle).not.toBe("");

    await page.reload();
    await expect(page.getByRole("region", { name: "Ask Dev workspace" })).toBeVisible();
    expect(conversationPosts, "Reload must not create another conversation.").toHaveLength(1);
    expect(messagePosts, "Reload must not execute another run.").toHaveLength(1);

    const retainedConversation = page
        .getByRole("complementary", { name: "Ask Dev history" })
        .getByRole("button", { name: retainedTitle as string })
        .first();
    await expect(retainedConversation).toBeVisible();
    await retainedConversation.click();
    await expect(
        page.getByLabel("Ask Dev transcript").getByText(QUESTION, { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("article", { name: "Ask Dev answer" })).toContainText(
        expectedSummary,
    );
    expect(
        conversationPosts,
        "Opening retained history must not create another conversation.",
    ).toHaveLength(1);
    expect(messagePosts, "Opening retained history must not execute another run.").toHaveLength(1);

    const history = page.getByRole("complementary", { name: "Ask Dev history" });
    const retainedItem = history
        .locator("li")
        .filter({ hasText: retainedTitle as string })
        .first();
    await retainedItem.getByRole("button", { name: "Edit" }).click();
    await history.getByLabel("Conversation title").fill(RENAMED_TITLE);
    await history.getByRole("button", { name: "Save" }).click();
    await expect(history.getByRole("button", { name: RENAMED_TITLE })).toBeVisible();

    const renamedResponse = await page.request.get(
        `/api/v1/dev/conversations/${encodeURIComponent(conversationId as string)}`,
    );
    expect(renamedResponse.ok()).toBe(true);
    expect(await renamedResponse.json()).toMatchObject({
        conversation_id: conversationId,
        retention_days: 30,
        title: RENAMED_TITLE,
    });

    const renamedItem = history.locator("li").filter({ hasText: RENAMED_TITLE }).first();
    await renamedItem.getByRole("button", { name: "Delete" }).click();
    await renamedItem.getByRole("button", { name: "Confirm delete?" }).click();
    await expect(history.getByRole("button", { name: RENAMED_TITLE })).toHaveCount(0);
    const deletedResponse = await page.request.get(
        `/api/v1/dev/conversations/${encodeURIComponent(conversationId as string)}`,
    );
    expect(deletedResponse.status()).toBe(404);
    expect(await deletedResponse.json()).toMatchObject({ code: "conversation_not_found" });

    const identity = await acceptanceAdmin(page);
    const ephemeralPolicy = await updateAskDevPolicy(page, identity, { retention_days: 0 });
    expect(ephemeralPolicy).toMatchObject({ settings: { retention_days: 0 } });
    try {
        // Retention is an organization-administrator policy (already set to 0
        // days above via updateAskDevPolicy), not a per-conversation control —
        // there is no "Conversation retention" selector to interact with
        // (CHAOS-3215 M7). The conversation created below inherits the org
        // policy purely from the backend, which the assertions after it
        // verify (retention_days: 0, a GRACED expires_at, and 404 after the
        // run completes).
        const ephemeralComposer = page
            .getByRole("region", { name: "Ask Dev workspace" })
            .getByRole("textbox", { name: "Ask Dev question" });
        await ephemeralComposer.fill(QUESTION);
        const ephemeralCreatePromise = page.waitForResponse(
            (response) =>
                new URL(response.url()).pathname === "/api/v1/dev/conversations" &&
                response.request().method() === "POST",
        );
        const ephemeralMessagePromise = page.waitForResponse(
            (response) =>
                /^\/api\/v1\/dev\/conversations\/[^/]+\/messages$/u.test(
                    new URL(response.url()).pathname,
                ) && response.request().method() === "POST",
        );
        // CHAOS-3581 / ops CHAOS-3544: a 0-day-retention conversation is no
        // longer stamped `expires_at: null` at creation. Two reachable
        // shapes (created-and-abandoned before any message; a run left
        // non-terminal by a crash) used to be retained forever under the
        // null stamp, so ops now stamps `now + EPHEMERAL_ABANDONED_GRACE`
        // (one hour, `api/dev/persistence/service.py`) at creation, and
        // moves it earlier to the completion time once a run actually
        // terminates. `beforeEphemeralCreate` is captured client-side,
        // before the request round-trip, so the server's `now` is slightly
        // later than it — the assertion below checks a window around the
        // one-hour grace rather than an exact value for that reason.
        const beforeEphemeralCreate = Date.now();
        await page
            .getByRole("region", { name: "Ask Dev workspace" })
            .getByRole("button", {
                name: "Ask",
                exact: true,
            })
            .click();
        const ephemeralCreate = (await (await ephemeralCreatePromise).json()) as JsonObject;
        expect(ephemeralCreate).toMatchObject({ retention_days: 0 });
        expect(
            typeof ephemeralCreate.expires_at,
            "0-day retention must stamp a graced expiry, not null (CHAOS-3544/CHAOS-3581).",
        ).toBe("string");
        const gracedExpiryMs =
            Date.parse(ephemeralCreate.expires_at as string) - beforeEphemeralCreate;
        const ONE_HOUR_MS = 60 * 60 * 1000;
        const GRACE_TOLERANCE_MS = 5 * 60 * 1000;
        expect(
            gracedExpiryMs,
            `expires_at must land ~1h after creation (EPHEMERAL_ABANDONED_GRACE), got ${String(gracedExpiryMs)}ms.`,
        ).toBeGreaterThan(ONE_HOUR_MS - GRACE_TOLERANCE_MS);
        expect(
            gracedExpiryMs,
            `expires_at must land ~1h after creation (EPHEMERAL_ABANDONED_GRACE), got ${String(gracedExpiryMs)}ms.`,
        ).toBeLessThan(ONE_HOUR_MS + GRACE_TOLERANCE_MS);
        const ephemeralId = ephemeralCreate.conversation_id as string;
        const ephemeralMessage = await ephemeralMessagePromise;
        expect(ephemeralMessage.ok()).toBe(true);
        expect(ephemeralMessage.headers()["content-type"]).toContain("text/event-stream");
        await page.waitForFunction(() => {
            const acceptanceWindow = window as Window & { __askDevSseBodies?: string[] };
            return (acceptanceWindow.__askDevSseBodies?.length ?? 0) === 1;
        });
        const ephemeralSseBody = await page.evaluate(() => {
            const acceptanceWindow = window as Window & { __askDevSseBodies?: string[] };
            return acceptanceWindow.__askDevSseBodies?.[0] ?? "";
        });
        expect(parseSse(ephemeralSseBody).map((event) => event.name)).toContain("answer.completed");
        expect(messagePosts).toHaveLength(2);
        await expect(page.getByRole("article", { name: "Ask Dev answer" })).toContainText(
            expectedSummary,
        );
        const expired = await page.request.get(
            `/api/v1/dev/conversations/${encodeURIComponent(ephemeralId)}`,
        );
        expect(expired.status()).toBe(404);
        expect(await expired.json()).toMatchObject({ code: "conversation_not_found" });
        const list = (await (
            await page.request.get("/api/v1/dev/conversations")
        ).json()) as JsonObject;
        expect(
            (list.items as JsonObject[]).some((item) => item.conversation_id === ephemeralId),
        ).toBe(false);
    } finally {
        await updateAskDevPolicy(page, identity, { retention_days: 30 });
    }
});

test("platform validation stays usable with Ask Dev and agent runtime disabled and denies members", async ({
    browser,
    page,
}, testInfo) => {
    await signInCanonicalUser(page);
    const identity = await acceptanceAdmin(page);
    const disabled = await updateAskDevPolicy(page, identity, { emergency_disabled: true });
    expect(disabled).toMatchObject({ settings: { emergency_disabled: true } });
    try {
        const capabilities = (await (
            await page.request.get("/api/v1/dev/capabilities")
        ).json()) as JsonObject;
        expect(capabilities).toMatchObject({
            agent_context_runtime: false,
            ask_dev: false,
            readiness: "disabled",
        });

        await page.goto("/superadmin/context-fabric/validation");
        await expect(
            page.getByRole("heading", { name: "Context Fabric Validation", level: 1 }),
        ).toBeVisible();
        await expect(page.getByTestId("data-state-not-entitled")).toHaveCount(0);
        const validationForm = page.getByRole("main").getByTestId("context-packet-form");
        await expect(validationForm).toBeVisible();
        await expect(validationForm.getByLabel("Goal (required)")).toBeEditable();
        await expect(validationForm.getByLabel("Repository (required)")).toBeEnabled();
        await expect(
            validationForm.getByRole("button", { name: "Generate context" }),
        ).toBeEnabled();
        await page.screenshot({
            path: testInfo.outputPath("context-fabric-validation-independent.png"),
            fullPage: true,
        });

        const memberEmail = `ask-dev-validation-${Date.now()}@example.com`;
        const memberPassword = "DevHealth123!";
        const userResponse = await page.request.post(`${liveBackendUrl}/api/v1/admin/users`, {
            data: {
                email: memberEmail,
                full_name: "Ask Dev validation member",
                is_superuser: false,
                is_verified: true,
                password: memberPassword,
            },
            headers: authHeaders(identity.token),
        });
        const member = (await userResponse.json()) as JsonObject;
        expect(userResponse.ok(), JSON.stringify(member)).toBe(true);
        const membershipResponse = await page.request.post(
            `${liveBackendUrl}/api/v1/admin/orgs/${identity.orgId}/members`,
            {
                data: { role: "member", user_id: member.id },
                headers: authHeaders(identity.token),
            },
        );
        expect(membershipResponse.ok(), await membershipResponse.text()).toBe(true);

        const memberContext = await browser.newContext({
            baseURL: process.env.ASK_DEV_ACCEPTANCE_WEB_URL ?? "http://127.0.0.1:3002",
        });
        try {
            const memberPage = await memberContext.newPage();
            await signInUser(memberPage, memberEmail, memberPassword);
            await memberPage.goto("/superadmin/context-fabric/validation");
            await expect(memberPage).toHaveURL(/\/dashboard(?:\?|$)/u);
            await expect(
                memberPage.getByRole("heading", { name: "Context Fabric Validation" }),
            ).toHaveCount(0);
            await memberPage.screenshot({
                path: testInfo.outputPath("context-fabric-validation-member-denied.png"),
                fullPage: true,
            });
        } finally {
            await memberContext.close();
        }
    } finally {
        await updateAskDevPolicy(page, identity, { emergency_disabled: false });
    }
});

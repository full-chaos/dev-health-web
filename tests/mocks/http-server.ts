import express from "express";
import { createMiddleware } from "@mswjs/http-middleware";
import {
    applyMessage,
    createConversation,
    deleteConversation,
    expandEvidence,
    getConversation,
    getDevCapabilitiesResponse,
    getDevRequestCounts,
    getTranscript,
    listConversations,
    renameConversation,
    resetDevMockState,
    setDevCapabilitiesState,
    submitFeedback,
} from "./devScenario";
import { setEntitlementScenario } from "./entitlementScenario";
import { handlers } from "./handlers";
import { pagerDutyObservations, setPagerDutyScenario } from "./pagerdutyScenario";
import { prDetailGraphQLResponse } from "./prDetailResponse";

const app = express();
const port = Number(process.env.MOCK_SERVER_PORT ?? 8000);
let acrRequestCount = 0;

app.use(express.json());
app.use((req, _res, next) => {
    if (req.path.startsWith("/api/v1/agent-context")) acrRequestCount += 1;
    next();
});
app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});
app.post("/__test/entitlements", (req, res) => {
    if (!setEntitlementScenario(req.body.scenario)) {
        res.status(400).json({ error: "Unknown entitlement scenario" });
        return;
    }
    acrRequestCount = 0;
    res.status(204).end();
});
app.get("/__test/acr-requests", (_req, res) => {
    res.json({ count: acrRequestCount });
});
app.post("/__test/pagerduty", (req, res) => {
    if (!setPagerDutyScenario(req.body?.scenario)) {
        res.status(400).json({ error: "Unknown PagerDuty scenario" });
        return;
    }
    res.status(204).end();
});
app.get("/__test/pagerduty/observations", (_req, res) => {
    res.json(pagerDutyObservations());
});

// --- Ask Dev deterministic mock (CHAOS-3287) ---------------------------
app.post("/__test/dev-reset", (_req, res) => {
    resetDevMockState();
    res.status(204).end();
});
app.get("/__test/dev-requests", (_req, res) => {
    res.json(getDevRequestCounts());
});
app.post("/__test/dev-capabilities", (req, res) => {
    if (!setDevCapabilitiesState(req.body?.state)) {
        res.status(400).json({ error: "Unknown Ask Dev capabilities state" });
        return;
    }
    res.status(204).end();
});
app.get("/api/v1/dev/capabilities", (_req, res) => {
    res.json(getDevCapabilitiesResponse());
});
app.post("/api/v1/dev/conversations", (req, res) => {
    res.status(201).json(createConversation(req.body?.current_scope, req.body?.title));
});
app.get("/api/v1/dev/conversations", (_req, res) => {
    res.json({ items: listConversations(), next_cursor: null });
});
app.get("/api/v1/dev/conversations/:conversationId", (req, res) => {
    const conversation = getConversation(req.params.conversationId);
    if (!conversation) {
        res.status(404).json({
            schema_version: "dev_web_error.v1",
            code: "conversation_not_found",
            safe_message: "This conversation could not be found.",
            retryable: false,
        });
        return;
    }
    res.json(conversation);
});
app.patch("/api/v1/dev/conversations/:conversationId", (req, res) => {
    const conversation = renameConversation(req.params.conversationId, req.body?.title ?? null);
    if (!conversation) {
        res.status(404).json({
            schema_version: "dev_web_error.v1",
            code: "conversation_not_found",
            safe_message: "This conversation could not be found.",
            retryable: false,
        });
        return;
    }
    res.json(conversation);
});
app.delete("/api/v1/dev/conversations/:conversationId", (req, res) => {
    deleteConversation(req.params.conversationId);
    res.status(204).end();
});
app.get("/api/v1/dev/conversations/:conversationId/transcript", (req, res) => {
    const transcript = getTranscript(req.params.conversationId);
    if (!transcript) {
        res.status(404).json({
            schema_version: "dev_web_error.v1",
            code: "conversation_not_found",
            safe_message: "This conversation could not be found.",
            retryable: false,
        });
        return;
    }
    res.json(transcript);
});
app.post("/api/v1/dev/conversations/:conversationId/messages", (req, res) => {
    const result = applyMessage(
        req.params.conversationId,
        String(req.body?.client_message_id ?? ""),
        String(req.body?.question ?? ""),
        req.body?.scope,
    );
    if (!result) {
        res.status(404).json({
            schema_version: "dev_web_error.v1",
            code: "conversation_not_found",
            safe_message: "This conversation could not be found.",
            retryable: false,
        });
        return;
    }
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.flushHeaders();
    res.write(result.frames);
    res.end();
});
app.get("/api/v1/dev/evidence/:evidenceRefId", (req, res) => {
    const answerId = String(req.query.answer_id ?? "");
    res.json(expandEvidence(req.params.evidenceRefId, answerId));
});
app.post("/api/v1/dev/answers/:answerId/feedback", (req, res) => {
    res.json(submitFeedback(req.params.answerId, req.body?.rating, req.body?.reasons));
});

app.use("/graphql", (req, res, next) => {
    const query = req.method === "GET" ? req.query.query : req.body?.query;
    if (typeof query !== "string" || !query.includes("PrDetail")) {
        next();
        return;
    }
    res.json(prDetailGraphQLResponse);
});
app.use(createMiddleware(...handlers));

app.listen(port, "127.0.0.1", () => {
    console.log(`Mock API server listening on http://127.0.0.1:${port}`);
});

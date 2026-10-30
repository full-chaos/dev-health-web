import { createServer } from "node:http";
import express from "express";
import {
    contextPacketForGoal,
    evidenceRequestStarted,
    expandedEvidenceForId,
    getAcrMockEvidenceStats,
    getContextPacketDelay,
    getEvidenceDelay,
    pausedContextPacketGoals,
    releasePausedContextPackets,
    setAcrMockControls,
    waitForContextPacketRelease,
} from "./acr-fixtures";
import investigationResultExample from "../../src/lib/ask-dev/__tests__/captures/context_fabric_investigation_result.v1.json";
import { hardenMockServer } from "./serverSockets";

const app = express();
const port = Number(process.env.ACR_MOCK_PORT ?? 8013);
const MAX_RESPONSE_TIMER_DELAY_MS = 60_000;

const capabilities = {
    enabled_tools: ["context_for_task", "source_evidence"],
    entitlements: { agent_context_runtime: true },
    generated_at: "2026-07-16T00:00:00Z",
    limits: {
        max_items: 30,
        max_output_tokens: 4000,
        max_serialized_bytes: 262144,
        requests_per_minute: 60,
    },
    minimum_sidecar_version: "1.0.0",
    permissions: { context_read: true, episode_write: false, evidence_read: true },
    schema_version: "capabilities.v1",
    service: "dev-health-acr",
    service_version: "0.1.0",
    supported_schema_versions: [
        "context_packet.v1",
        "context_packet_request.v1",
        "expanded_evidence.v1",
    ],
};

function isPausedPacketRelease(value: unknown): value is { readonly goal: string } {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        "goal" in value &&
        typeof value.goal === "string"
    );
}

app.use(express.json());
app.get("/health", (_request, response) => response.json({ status: "ok" }));
app.get("/api/v1/agent-context/capabilities", (_request, response) => response.json(capabilities));
app.post("/__test/controls", (request, response) => {
    if (!setAcrMockControls(request.body)) {
        response.status(400).json({ error: "Invalid ACR mock controls" });
        return;
    }
    response.status(204).end();
});
app.get("/__test/evidence-requests", (_request, response) => {
    response.json(getAcrMockEvidenceStats());
});
app.get("/__test/paused-context-packets", (_request, response) => {
    response.json({ goals: pausedContextPacketGoals() });
});
app.post("/__test/paused-context-packets/release", (request, response) => {
    if (!isPausedPacketRelease(request.body) || !releasePausedContextPackets(request.body.goal)) {
        response.status(404).end();
        return;
    }
    response.status(204).end();
});
// CHAOS-11921: the investigation stream, to prove the web route reaches ACR with an assertion.
let investigationRequests = 0;
app.get("/__test/investigation-requests", (_request, response) => {
    response.json({ count: investigationRequests });
});
app.post("/api/v1/context-fabric/investigations", (request, response) => {
    investigationRequests += 1;
    if (
        request.header("accept") !== "text/event-stream" ||
        (request.header("x-acr-web-assertion") ?? "") === "" ||
        request.header("authorization") !== undefined
    ) {
        response.status(400).json({ error: "bad ask-dev call" });
        return;
    }
    response.setHeader("Content-Type", "text/event-stream");
    response.write('event: accepted\ndata: {"seq":1}\n\n');
    response.end('event: result\ndata: {"seq":2}\n\n');
});
// CHAOS-11922: the replay read. `res_other_principal` stands for a result another principal or org
// owns (ACR answers one 404 for it and for an unknown id); every other well-formed id is replayed.
let investigationReads = 0;
app.get("/__test/investigation-reads", (_request, response) => {
    response.json({ count: investigationReads });
});
// CHAOS-11923: the owner-checked submission status. `sub_other_principal` stands for another
// principal's submission (one 404, the same as for an unknown id).
let submissionReads = 0;
app.get("/__test/submission-reads", (_request, response) => {
    response.json({ count: submissionReads });
});
app.get("/api/v1/context-fabric/investigations/submissions/:submissionId", (request, response) => {
    submissionReads += 1;
    if ((request.header("x-acr-web-assertion") ?? "") === "") {
        response.status(401).json({ error: "bad ask-dev call" });
        return;
    }
    if (request.params.submissionId === "sub_other_principal") {
        response.status(404).json({
            error: { code: "not_found", http_status: 404, message: "redacted", retryable: false },
            request_id: "acr_req_0002",
            schema_version: "error.v1",
        });
        return;
    }
    response.json({
        reserved_result_id: "res_0a1b2c3d4e5f",
        result_id: "res_0a1b2c3d4e5f",
        schema_version: "context_fabric_submission_status.v1",
        state: "done",
        submission_id: request.params.submissionId,
        thread_id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        updated_at: "2026-10-30T07:00:00Z",
    });
});
app.get("/api/v1/context-fabric/investigations/:resultId", (request, response) => {
    investigationReads += 1;
    if ((request.header("x-acr-web-assertion") ?? "") === "") {
        response.status(401).json({ error: "bad ask-dev call" });
        return;
    }
    if (request.params.resultId === "res_other_principal") {
        response.status(404).json({
            error: { code: "not_found", http_status: 404, message: "redacted", retryable: false },
            request_id: "acr_req_0001",
            schema_version: "error.v1",
        });
        return;
    }
    response.json(investigationResultExample);
});
app.post("/api/v1/agent-context/context-packets", async (request, response) => {
    const goal =
        typeof request.body.goal === "string"
            ? request.body.goal
            : "Add repository-scoped ACR credentials";
    if (goal === "e2e error") return response.status(503).json({ error: "unavailable" });
    const sendPacket = () => response.json(contextPacketForGoal(goal));
    const delay = getContextPacketDelay(goal);
    if (delay > 0 && delay <= MAX_RESPONSE_TIMER_DELAY_MS) {
        setTimeout(sendPacket, delay);
        return;
    }
    const release = waitForContextPacketRelease(goal);
    if (release !== null) {
        await release;
        if (!response.destroyed) sendPacket();
        return;
    }
    sendPacket();
});
app.get("/api/v1/agent-context/evidence/:evidenceRefId", (request, response) => {
    if (request.params.evidenceRefId === "unknown-reference") return response.status(404).json({});
    const finish = evidenceRequestStarted();
    const sendEvidence = () => {
        if (!response.destroyed) response.json(expandedEvidenceForId(request.params.evidenceRefId));
        finish();
    };
    response.once("close", finish);
    const delay = getEvidenceDelay();
    if (delay > 0 && delay <= MAX_RESPONSE_TIMER_DELAY_MS) {
        setTimeout(sendEvidence, delay);
        return;
    }
    sendEvidence();
});

hardenMockServer(
    createServer(app).listen(port, "127.0.0.1", () => {
        console.log(`Mock ACR server listening on http://127.0.0.1:${port}`);
    }),
    "acr-8013",
);

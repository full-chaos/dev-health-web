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

createServer(app).listen(port, "127.0.0.1", () => {
    console.log(`Mock ACR server listening on http://127.0.0.1:${port}`);
});

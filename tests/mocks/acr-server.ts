import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import express from "express";
import contextPacket from "../../src/lib/acr/contracts/examples/context_packet.v1.json";
import expandedEvidence from "../../src/lib/acr/contracts/examples/expanded_evidence.v1.json";

const app = express();
const port = Number(process.env.ACR_MOCK_PORT ?? 8013);
const certificateFile = process.env.ACR_MOCK_CERT_FILE;
const keyFile = process.env.ACR_MOCK_KEY_FILE;

if (!certificateFile || !keyFile) throw new Error("ACR mock TLS files are required");

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

app.use(express.json());
app.get("/health", (_request, response) => response.json({ status: "ok" }));
app.get("/api/v1/agent-context/capabilities", (_request, response) => response.json(capabilities));
app.post("/api/v1/agent-context/context-packets", (request, response) => {
    const goal = typeof request.body.goal === "string" ? request.body.goal : contextPacket.goal;
    if (goal === "e2e error") return response.status(503).json({ error: "unavailable" });
    const status =
        goal === "e2e empty"
            ? "empty"
            : goal === "e2e degraded"
              ? "degraded"
              : goal === "e2e partial"
                ? "partial"
                : "complete";
    const items = status === "empty" ? [] : contextPacket.items;
    return response.json({
        ...contextPacket,
        context_packet_id: `e2e-${status}`,
        goal,
        items,
        status,
    });
});
app.get("/api/v1/agent-context/evidence/:evidenceRefId", (request, response) => {
    if (request.params.evidenceRefId === "unknown-reference") return response.status(404).json({});
    return response.json({
        ...expandedEvidence,
        evidence: { ...expandedEvidence.evidence, evidence_ref_id: request.params.evidenceRefId },
    });
});

createServer({ cert: readFileSync(certificateFile), key: readFileSync(keyFile) }, app).listen(
    port,
    "127.0.0.1",
    () => {
        console.log(`Mock ACR server listening on https://127.0.0.1:${port}`);
    },
);

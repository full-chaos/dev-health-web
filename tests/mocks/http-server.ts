import express from "express";
import { createMiddleware } from "@mswjs/http-middleware";
import { setEntitlementScenario } from "./entitlementScenario";
import { handlers, setMockAdminRows, type MockAdminRowSeed } from "./handlers";
import { pagerDutyObservations, setPagerDutyScenario } from "./pagerdutyScenario";
import { prDetailGraphQLResponse } from "./prDetailResponse";
import { hardenMockServer } from "./serverSockets";

const app = express();
const port = Number(process.env.MOCK_SERVER_PORT ?? 8000);
let acrRequestCount = 0;
let backendRequestCount = 0;

app.use(express.json());
app.use((req, _res, next) => {
    if (req.path.startsWith("/api/v1/agent-context")) acrRequestCount += 1;
    if (!req.path.startsWith("/__test/") && req.path !== "/health") backendRequestCount += 1;
    next();
});
// CHAOS-9130: backend reads the web server made, to count the renders of one first load.
app.get("/__test/backend-requests", (_req, res) => {
    res.json({ count: backendRequestCount });
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

// CHAOS-9105: the team and identity rows of the admin lists, with ids of a shape the spec picks.
app.post("/__test/admin-rows", (req, res) => {
    const seed = req.body as MockAdminRowSeed | undefined;
    if (!seed || (seed.teams && !Array.isArray(seed.teams))) {
        res.status(400).json({ error: "Expected { teams?: [], identities?: [] }" });
        return;
    }
    setMockAdminRows(seed);
    res.status(204).end();
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

hardenMockServer(
    app.listen(port, "127.0.0.1", () => {
        console.log(`Mock API server listening on http://127.0.0.1:${port}`);
    }),
    "ops-8012",
);

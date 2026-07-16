import express from "express";
import { createMiddleware } from "@mswjs/http-middleware";
import { setEntitlementScenario } from "./entitlementScenario";
import { handlers } from "./handlers";

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
app.use(createMiddleware(...handlers));

app.listen(port, "127.0.0.1", () => {
    console.log(`Mock API server listening on http://127.0.0.1:${port}`);
});

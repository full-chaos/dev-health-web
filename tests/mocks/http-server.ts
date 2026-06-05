import express from "express";
import { createMiddleware } from "@mswjs/http-middleware";
import { handlers } from "./handlers";

const app = express();
const port = Number(process.env.MOCK_SERVER_PORT ?? 8000);

app.use(express.json());
app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});
app.use(createMiddleware(...handlers));

app.listen(port, "127.0.0.1", () => {
    console.log(`Mock API server listening on http://127.0.0.1:${port}`);
});

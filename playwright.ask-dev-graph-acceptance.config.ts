import { defineConfig } from "@playwright/test";

const required = (name: string): string => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is required; graph acceptance must fail closed.`);
    return value;
};

if (process.env.ASK_DEV_GRAPH_LIVE_ACCEPTANCE !== "1") {
    throw new Error("Set ASK_DEV_GRAPH_LIVE_ACCEPTANCE=1 to arm the graph acceptance gate.");
}
if (process.env.ASK_DEV_COMPOSE_WEB_READY !== "1") {
    throw new Error("Graph acceptance requires the canonical Compose-booted Web service.");
}
for (const name of [
    "ASK_DEV_GRAPH_ACCEPTANCE_QUESTION",
    "ASK_DEV_GRAPH_ACCEPTANCE_FALLBACK_QUESTION",
    "ASK_DEV_GRAPH_ACCEPTANCE_AMBIGUOUS_QUESTION",
    "ASK_DEV_GRAPH_ACCEPTANCE_EXPECTED_GRAPH_STATE",
    "ASK_DEV_GRAPH_ACCEPTANCE_EXPECTED_FALLBACK_STATE",
    "ASK_DEV_GRAPH_ACCEPTANCE_BACKEND_SHA",
])
    required(name);

export default defineConfig({
    testDir: "./tests/live",
    testMatch: /ask-dev-graph-acceptance\.spec\.ts/,
    reporter: [["list"], ["html", { open: "never" }]],
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 120_000,
    expect: { timeout: 20_000 },
    use: {
        baseURL: process.env.ASK_DEV_ACCEPTANCE_WEB_URL ?? "http://127.0.0.1:3002",
        headless: true,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
});

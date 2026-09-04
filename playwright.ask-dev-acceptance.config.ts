import { defineConfig } from "@playwright/test";

if (process.env.ASK_DEV_LIVE_ACCEPTANCE !== "1") {
    throw new Error(
        "Ask Dev acceptance was not armed. Set ASK_DEV_LIVE_ACCEPTANCE=1; this gate must never skip silently.",
    );
}
if (process.env.ASK_DEV_COMPOSE_WEB_READY !== "1") {
    throw new Error(
        "Ask Dev acceptance requires the Compose-booted Web service. Run the canonical Ops acceptance launcher; a separately started Web process is not release evidence.",
    );
}
if (!process.env.ASK_DEV_ACCEPTANCE_QUESTION?.trim()) {
    throw new Error(
        "ASK_DEV_ACCEPTANCE_QUESTION is required and must come from the checked-in acceptance oracle.",
    );
}
for (const name of [
    "ASK_DEV_ACCEPTANCE_EXPECTED_METRIC_ID",
    "ASK_DEV_ACCEPTANCE_EXPECTED_EVIDENCE_FRAGMENT",
    "ASK_DEV_ACCEPTANCE_EXPECTED_CLAIM_KIND",
]) {
    if (!process.env[name]?.trim()) {
        throw new Error(`${name} is required and must come from the checked-in acceptance oracle.`);
    }
}

export default defineConfig({
    testDir: "./tests/live",
    testMatch: /ask-dev-acceptance\.spec\.ts/,
    reporter: [["html"], ["list"]],
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 90_000,
    expect: { timeout: 15_000 },
    use: {
        baseURL: process.env.ASK_DEV_ACCEPTANCE_WEB_URL ?? "http://127.0.0.1:3002",
        headless: true,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
});

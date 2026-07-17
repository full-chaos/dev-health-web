export const OWNED_PROCESS_ESCALATION_TIMEOUT_MS = 5_000;
export const PLAYWRIGHT_GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10_000;

if (PLAYWRIGHT_GRACEFUL_SHUTDOWN_TIMEOUT_MS <= OWNED_PROCESS_ESCALATION_TIMEOUT_MS) {
    throw new Error("Playwright shutdown budget must exceed owned-process escalation timeout.");
}

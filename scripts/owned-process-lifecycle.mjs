export const OWNED_PROCESS_ESCALATION_TIMEOUT_MS = 5_000;
export const PLAYWRIGHT_GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10_000;
export const OWNED_PROCESS_CLEANUP_SAFETY_MARGIN_MS = 1_000;
export const OWNED_PROCESS_WAIT_TIMEOUT_MS = Math.floor(
    (PLAYWRIGHT_GRACEFUL_SHUTDOWN_TIMEOUT_MS - OWNED_PROCESS_CLEANUP_SAFETY_MARGIN_MS) / 2,
);

export function shouldForwardSupervisorSignal(platform = process.platform) {
    return platform === "win32";
}

if (
    OWNED_PROCESS_WAIT_TIMEOUT_MS * 2 + OWNED_PROCESS_CLEANUP_SAFETY_MARGIN_MS >
    PLAYWRIGHT_GRACEFUL_SHUTDOWN_TIMEOUT_MS
) {
    throw new Error("Playwright shutdown budget cannot reserve the cleanup safety margin.");
}

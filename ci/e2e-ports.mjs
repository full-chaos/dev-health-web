// CHAOS-12807. One table of every port the e2e suites listen on. Each reads an env var; unset keeps
// the port the suite always used. `ci/pick-e2e-ports.mjs` fills the env so two gates can run at once.

export const E2E_PORT_ENV = Object.freeze({
    webPort: "PLAYWRIGHT_WEB_PORT",
    mockPort: "PLAYWRIGHT_MOCK_PORT",
    customerPushWebPort: "PLAYWRIGHT_CUSTOMER_PUSH_WEB_PORT",
    customerPushMockPort: "PLAYWRIGHT_CUSTOMER_PUSH_MOCK_PORT",
    navigationWebPort: "PLAYWRIGHT_NAVIGATION_WEB_PORT",
    navigationMockPort: "PLAYWRIGHT_NAVIGATION_MOCK_PORT",
    onboardingWebPort: "PLAYWRIGHT_ONBOARDING_WEB_PORT",
    onboardingMockPort: "PLAYWRIGHT_ONBOARDING_MOCK_PORT",
    contextFabricBffPort: "CONTEXT_FABRIC_BFF_PORT",
    contextFabricOpsPort: "CONTEXT_FABRIC_OPS_PORT",
    contextFabricAcrPort: "CONTEXT_FABRIC_ACR_PORT",
});

export const E2E_PORT_DEFAULTS = Object.freeze({
    webPort: 3001,
    mockPort: 8001,
    customerPushWebPort: 3004,
    customerPushMockPort: 8004,
    navigationWebPort: 3005,
    navigationMockPort: 8005,
    onboardingWebPort: 3003,
    onboardingMockPort: 8002,
    contextFabricBffPort: 3012,
    contextFabricOpsPort: 8012,
    contextFabricAcrPort: 8013,
});

/** @param {Record<string, string | undefined>} [env] */
export function resolveE2ePorts(env = process.env) {
    return Object.fromEntries(
        Object.entries(E2E_PORT_ENV).map(([key, name]) => {
            const raw = env[name];
            if (raw === undefined || raw === "") return [key, E2E_PORT_DEFAULTS[key]];
            const port = Number(raw);
            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                throw new Error(`${name} must be an integer from 1 to 65535, got "${raw}".`);
            }
            return [key, port];
        }),
    );
}

export const e2ePorts = resolveE2ePorts();
export const e2eOrigin = (/** @type {number | string} */ port) => `http://127.0.0.1:${port}`;

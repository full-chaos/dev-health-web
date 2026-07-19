import { http, HttpResponse } from "msw";
import type { MockCredential, MockSyncConfig } from "./types";

const PAGERDUTY_SCENARIOS = [
    "not-connected",
    "connected-us",
    "connected-eu",
    "expired",
    "status-error",
    "preflight-partial",
    "disconnect-error",
    "callback-error",
    "mapping-fixture",
    "mapping-unresolved",
] as const;

export type PagerDutyScenario = (typeof PAGERDUTY_SCENARIOS)[number];

type PagerDutyObservations = {
    readonly callback_count: number;
    readonly calls: Readonly<Record<string, number>>;
    readonly last_sync_options: Record<string, unknown> | null;
};

const PAGERDUTY_CREDENTIAL: MockCredential = {
    id: "cred-pagerduty-1",
    provider: "pagerduty",
    name: "PagerDuty operations",
    created_at: "2026-07-19T00:00:00.000Z",
};

const pagerDutySyncConfig = (serviceExternalId = "service-api"): MockSyncConfig => ({
    id: "sync-config-pagerduty-1",
    provider: "pagerduty",
    name: "PagerDuty operational services",
    enabled: true,
    credential_id: PAGERDUTY_CREDENTIAL.id,
    sync_targets: ["operational"],
    sync_options: {
        preserved_namespace: { source: "fixture" },
        service_repository_mappings: {
            imported: { "service-imported": [{ provider: "gitlab", full_name: "chaos/imported" }] },
            admin: {
                [serviceExternalId]: [
                    { provider: "github", full_name: "chaos/api" },
                    { provider: "gitlab", full_name: "chaos/api-mirror" },
                ],
            },
        },
    },
    is_active: true,
    schedule_cron: null,
    timezone: null,
    initial_sync_depth: 30,
    last_sync_at: null,
    last_sync_success: null,
    last_sync_error: null,
    parent_id: null,
    created_at: "2026-07-19T00:00:00.000Z",
    updated_at: "2026-07-19T00:00:00.000Z",
});

let scenario: PagerDutyScenario = "not-connected";
let callbackCount = 0;
let calls: Record<string, number> = {};
let lastSyncOptions: Record<string, unknown> | null = null;
let mappingFixture = pagerDutySyncConfig();
let manualAuthMode: "client_credentials" | "api_token" | null = null;

function incrementCall(name: string): void {
    calls = { ...calls, [name]: (calls[name] ?? 0) + 1 };
}

function hasMappingFixture(): boolean {
    return scenario === "mapping-fixture" || scenario === "mapping-unresolved";
}

function connectedStatus(credentialName: string) {
    const region = scenario === "connected-eu" ? "eu" : "us";
    return {
        connected: true,
        credential_name: credentialName,
        auth_mode: "oauth",
        region,
        subdomain: region === "eu" ? "eu-operations" : "operations",
        account_id: region === "eu" ? "eu-operations" : "operations",
        account_display: region === "eu" ? "EU Operations" : "Operations",
        granted_scopes:
            scenario === "preflight-partial"
                ? ["services.read"]
                : ["incidents.read", "services.read"],
        expires_at:
            scenario === "expired" ? "2020-01-01T00:00:00.000Z" : "2030-01-01T00:00:00.000Z",
        has_refresh_token: true,
    };
}

function manualStatus(credentialName: string) {
    const region = scenario === "connected-eu" ? "eu" : "us";
    const subdomain = region === "eu" ? "eu-operations" : "operations";
    return {
        connected: true,
        credential_name: credentialName,
        auth_mode: manualAuthMode,
        region,
        subdomain,
        account_id: subdomain,
        account_display: region === "eu" ? "EU Operations" : "Operations",
        granted_scopes: [],
        expires_at: null,
        has_refresh_token: false,
    };
}

function isPagerDutyScenario(value: unknown): value is PagerDutyScenario {
    return typeof value === "string" && PAGERDUTY_SCENARIOS.includes(value as PagerDutyScenario);
}

export function setPagerDutyScenario(value: unknown): boolean {
    if (!isPagerDutyScenario(value)) return false;
    scenario = value;
    callbackCount = 0;
    calls = {};
    lastSyncOptions = null;
    mappingFixture = pagerDutySyncConfig(
        value === "mapping-unresolved" ? "service-unavailable" : "service-api",
    );
    manualAuthMode = null;
    return true;
}

export function pagerDutyObservations(): PagerDutyObservations {
    return { callback_count: callbackCount, calls, last_sync_options: lastSyncOptions };
}

export function withPagerDutyCredentials(
    credentials: readonly MockCredential[],
): readonly MockCredential[] {
    return hasMappingFixture() ? [...credentials, PAGERDUTY_CREDENTIAL] : credentials;
}

export function withPagerDutySyncConfigs(
    configs: readonly MockSyncConfig[],
): readonly MockSyncConfig[] {
    return hasMappingFixture() ? [...configs, mappingFixture] : configs;
}

export function getPagerDutySyncConfig(id: string): MockSyncConfig | null {
    return hasMappingFixture() && id === mappingFixture.id ? mappingFixture : null;
}

export function updatePagerDutySyncConfig(id: string, body: unknown): MockSyncConfig | null {
    if (
        !hasMappingFixture() ||
        id !== mappingFixture.id ||
        typeof body !== "object" ||
        body === null
    ) {
        return null;
    }
    const payload = body as Record<string, unknown>;
    const syncOptions = payload["sync_options"];
    if (typeof syncOptions === "object" && syncOptions !== null && !Array.isArray(syncOptions)) {
        lastSyncOptions = syncOptions as Record<string, unknown>;
        mappingFixture = { ...mappingFixture, sync_options: lastSyncOptions };
    }
    incrementCall("sync-config-patch");
    return mappingFixture;
}

export const pagerDutyHandlers = [
    http.get("*/api/v1/admin/integrations/pagerduty/services", ({ request }) => {
        const credentialName =
            new URL(request.url).searchParams.get("credential_name") ?? "default";
        return HttpResponse.json({
            credential_name: credentialName,
            services: [
                {
                    external_id: "service-api",
                    display_name: "API service",
                    name_resolved: true,
                    status: "active",
                },
            ],
        });
    }),
    http.get("*/api/v1/admin/integrations/pagerduty/status", async ({ request }) => {
        incrementCall("status");
        const credentialName =
            new URL(request.url).searchParams.get("credential_name") ?? "default";
        if (credentialName === "slow") await new Promise((resolve) => setTimeout(resolve, 250));
        incrementCall("status-response");
        if (scenario === "status-error") {
            return new HttpResponse(null, { status: 204 });
        }
        if (scenario === "not-connected") {
            return HttpResponse.json({
                connected: false,
                credential_name: credentialName,
                auth_mode: null,
                region: null,
                subdomain: null,
                account_id: null,
                account_display: null,
                granted_scopes: [],
                expires_at: null,
                has_refresh_token: false,
            });
        }
        return HttpResponse.json(
            manualAuthMode ? manualStatus(credentialName) : connectedStatus(credentialName),
        );
    }),
    http.post("*/api/v1/admin/integrations/pagerduty/authorize", () => {
        incrementCall("authorize");
        return HttpResponse.json({
            authorize_url:
                "http://127.0.0.1:3001/org/admin/integrations/pagerduty/callback?state=mock-state&code=mock-code",
        });
    }),
    http.post("*/api/v1/admin/integrations/pagerduty/callback", async ({ request }) => {
        incrementCall("callback");
        callbackCount += 1;
        const body = (await request.json()) as { readonly error?: string };
        if (scenario === "callback-error" || body.error) {
            return HttpResponse.json({ detail: "Authorization was denied" }, { status: 400 });
        }
        return HttpResponse.json({
            connected: true,
            credential_name: "default",
            region: "us",
            subdomain: "operations",
            granted_scopes: ["incidents.read", "services.read"],
        });
    }),
    http.post("*/api/v1/admin/integrations/pagerduty/client-credentials", () => {
        incrementCall("client-credentials");
        manualAuthMode = "client_credentials";
        return HttpResponse.json(manualStatus("production"));
    }),
    http.post("*/api/v1/admin/integrations/pagerduty/api-token", () => {
        incrementCall("api-token");
        manualAuthMode = "api_token";
        return HttpResponse.json(manualStatus("personal"));
    }),
    http.post("*/api/v1/admin/integrations/pagerduty/preflight", () => {
        incrementCall("preflight");
        return HttpResponse.json({
            connected: true,
            credential_name: "default",
            datasets: [
                {
                    requested: "services",
                    required_scopes: ["services.read"],
                    granted: true,
                    missing: [],
                },
                {
                    requested: "incidents",
                    required_scopes: ["incidents.read"],
                    granted: scenario !== "preflight-partial",
                    missing: scenario === "preflight-partial" ? ["incidents.read"] : [],
                },
            ],
        });
    }),
    http.post("*/api/v1/admin/integrations/pagerduty/disconnect", () => {
        incrementCall("disconnect");
        if (scenario === "disconnect-error") {
            return HttpResponse.json({ detail: "Disconnect failed" }, { status: 503 });
        }
        scenario = "not-connected";
        manualAuthMode = null;
        return HttpResponse.json({ disconnected: true, credential_name: "default" });
    }),
];

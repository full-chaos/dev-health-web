import { beforeEach, describe, expect, it, vi } from "vitest";
import { pagerDutyApi } from "../pagerduty";
import type {
    PagerDutyApiTokenConnectedResponse,
    PagerDutyAuthorizeResponse,
    PagerDutyClientCredentialsConnectedResponse,
    PagerDutyDisconnectResponse,
    PagerDutyOAuthCallbackConnectedResponse,
    PagerDutyPreflightResponse,
    PagerDutyServicesResponse,
    PagerDutyStatusResponse,
} from "../../pagerduty";

type Equal<Left, Right> =
    (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
        ? true
        : false;
type Assert<Condition extends true> = Condition;

type _AuthorizeResponse = Assert<
    Equal<Awaited<ReturnType<typeof pagerDutyApi.authorize>>, PagerDutyAuthorizeResponse>
>;
type _CallbackResponse = Assert<
    Equal<
        Awaited<ReturnType<typeof pagerDutyApi.callback>>,
        PagerDutyOAuthCallbackConnectedResponse
    >
>;
type _StatusResponse = Assert<
    Equal<Awaited<ReturnType<typeof pagerDutyApi.status>>, PagerDutyStatusResponse>
>;
type _DisconnectResponse = Assert<
    Equal<Awaited<ReturnType<typeof pagerDutyApi.disconnect>>, PagerDutyDisconnectResponse>
>;
type _PreflightResponse = Assert<
    Equal<Awaited<ReturnType<typeof pagerDutyApi.preflight>>, PagerDutyPreflightResponse>
>;
type _ServicesResponse = Assert<
    Equal<Awaited<ReturnType<typeof pagerDutyApi.services>>, PagerDutyServicesResponse>
>;
type _ClientCredentialsResponse = Assert<
    Equal<
        Awaited<ReturnType<typeof pagerDutyApi.clientCredentials>>,
        PagerDutyClientCredentialsConnectedResponse
    >
>;
type _ApiTokenResponse = Assert<
    Equal<Awaited<ReturnType<typeof pagerDutyApi.apiToken>>, PagerDutyApiTokenConnectedResponse>
>;

const authorizeResponse = {
    authorize_url: "https://identity.pagerduty.test/authorize",
} satisfies PagerDutyAuthorizeResponse;

const callbackResponse = {
    connected: true,
    credential_name: "operations",
    region: "eu",
    subdomain: "acme",
    granted_scopes: ["Incidents.read"],
} satisfies PagerDutyOAuthCallbackConnectedResponse;

const statusResponse = {
    connected: true,
    credential_name: "operations",
    auth_mode: "oauth",
    region: "eu",
    subdomain: "acme",
    account_id: "acme",
    account_display: "Acme",
    granted_scopes: ["Incidents.read"],
    expires_at: "2026-07-18T12:00:00Z",
    has_refresh_token: true,
} satisfies PagerDutyStatusResponse;

const disconnectResponse = {
    disconnected: true,
    credential_name: "operations",
} satisfies PagerDutyDisconnectResponse;

const preflightResponse = {
    connected: true,
    credential_name: "operations",
    datasets: [
        {
            requested: "incidents",
            required_scopes: ["Incidents.read"],
            granted: true,
            missing: [],
        },
    ],
} satisfies PagerDutyPreflightResponse;

const servicesResponse = {
    credential_name: "operations",
    services: [
        {
            external_id: "P123ABC",
            display_name: "Payments API",
            name_resolved: true,
            status: "active",
        },
    ],
} satisfies PagerDutyServicesResponse;

const clientCredentialsResponse = {
    connected: true,
    credential_name: "automation",
    auth_mode: "client_credentials",
    region: "eu",
    subdomain: "acme",
} satisfies PagerDutyClientCredentialsConnectedResponse;

const apiTokenResponse = {
    connected: true,
    credential_name: "personal",
    auth_mode: "api_token",
    region: "us",
    subdomain: "acme",
} satisfies PagerDutyApiTokenConnectedResponse;

describe("PagerDuty admin API", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
    });

    it("uses the exact PagerDuty endpoint payloads and response contracts", async () => {
        const responses = [
            authorizeResponse,
            callbackResponse,
            statusResponse,
            disconnectResponse,
            preflightResponse,
            servicesResponse,
            clientCredentialsResponse,
            apiTokenResponse,
        ];
        const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async () => {
            const response = responses.shift();
            return new Response(JSON.stringify(response), { status: 200 });
        });

        await expect(
            pagerDutyApi.authorize(
                {
                    credential_name: "operations",
                    enabled_datasets: ["incidents"],
                    region: "eu",
                    subdomain: "acme",
                },
                "token-1",
                "org-1",
            ),
        ).resolves.toEqual(authorizeResponse);
        await expect(
            pagerDutyApi.callback(
                { state: "callback-state", code: "callback-code" },
                "token-1",
                "org-1",
            ),
        ).resolves.toEqual(callbackResponse);
        await expect(pagerDutyApi.status("operations", "token-1", "org-1")).resolves.toEqual(
            statusResponse,
        );
        await expect(pagerDutyApi.disconnect("operations", "token-1", "org-1")).resolves.toEqual(
            disconnectResponse,
        );
        await expect(
            pagerDutyApi.preflight("operations", ["incidents"], "token-1", "org-1"),
        ).resolves.toEqual(preflightResponse);
        await expect(pagerDutyApi.services("operations", "token-1", "org-1")).resolves.toEqual(
            servicesResponse,
        );
        await expect(
            pagerDutyApi.clientCredentials(
                {
                    credential_name: "automation",
                    client_id: "client-id",
                    client_secret: "client-secret",
                    subdomain: "acme",
                    region: "eu",
                },
                "token-1",
                "org-1",
            ),
        ).resolves.toEqual(clientCredentialsResponse);
        await expect(
            pagerDutyApi.apiToken(
                {
                    credential_name: "personal",
                    api_token: "api-token",
                    subdomain: "acme",
                    region: "us",
                },
                "token-1",
                "org-1",
            ),
        ).resolves.toEqual(apiTokenResponse);

        expect(fetchSpy).toHaveBeenCalledTimes(8);
        const calls = fetchSpy.mock.calls;
        expect(calls[0]?.[0]).toBe(
            "http://test-ops:8000/api/v1/admin/integrations/pagerduty/authorize",
        );
        expect(calls[0]?.[1]?.body).toBe(
            JSON.stringify({
                credential_name: "operations",
                enabled_datasets: ["incidents"],
                region: "eu",
                subdomain: "acme",
            }),
        );
        expect(calls[1]?.[0]).toBe(
            "http://test-ops:8000/api/v1/admin/integrations/pagerduty/callback",
        );
        expect(calls[1]?.[1]?.body).toBe(
            JSON.stringify({ state: "callback-state", code: "callback-code" }),
        );
        expect(calls[2]?.[0]).toBe(
            "http://test-ops:8000/api/v1/admin/integrations/pagerduty/status?credential_name=operations",
        );
        expect(calls[3]?.[0]).toBe(
            "http://test-ops:8000/api/v1/admin/integrations/pagerduty/disconnect",
        );
        expect(calls[3]?.[1]?.body).toBe(JSON.stringify({ credential_name: "operations" }));
        expect(calls[4]?.[1]?.body).toBe(
            JSON.stringify({ credential_name: "operations", enabled_datasets: ["incidents"] }),
        );
        expect(calls[5]?.[0]).toBe(
            "http://test-ops:8000/api/v1/admin/integrations/pagerduty/services?credential_name=operations",
        );
        expect(calls[5]?.[1]?.method).toBeUndefined();
        expect(calls[6]?.[1]?.body).toBe(
            JSON.stringify({
                credential_name: "automation",
                client_id: "client-id",
                client_secret: "client-secret",
                subdomain: "acme",
                region: "eu",
            }),
        );
        expect(calls[7]?.[1]?.body).toBe(
            JSON.stringify({
                credential_name: "personal",
                api_token: "api-token",
                subdomain: "acme",
                region: "us",
            }),
        );
    });
});

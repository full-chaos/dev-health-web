import { request } from "./_request";
import type {
    PagerDutyApiTokenConnectedResponse,
    PagerDutyAuthorizeResponse,
    PagerDutyClientCredentialsConnectedResponse,
    PagerDutyDisconnectResponse,
    PagerDutyOAuthCallbackConnectedResponse,
    PagerDutyPreflightResponse,
    PagerDutyRegion,
    PagerDutyServicesResponse,
    PagerDutyStatusResponse,
} from "../pagerduty";

type PagerDutyOAuthCallbackInput = {
    readonly state: string;
    readonly code?: string;
    readonly error?: string;
};

export const pagerDutyApi = {
    authorize: (token?: string, orgId?: string) =>
        request<PagerDutyAuthorizeResponse>(
            "/integrations/pagerduty/authorize",
            { method: "POST", body: JSON.stringify({}) },
            token,
            orgId,
        ),
    callback: (input: PagerDutyOAuthCallbackInput, token?: string, orgId?: string) =>
        request<PagerDutyOAuthCallbackConnectedResponse>(
            "/integrations/pagerduty/callback",
            { method: "POST", body: JSON.stringify(input) },
            token,
            orgId,
        ),
    status: (credentialName: string, token?: string, orgId?: string) =>
        request<PagerDutyStatusResponse>(
            `/integrations/pagerduty/status?credential_name=${encodeURIComponent(credentialName)}`,
            {},
            token,
            orgId,
        ),
    disconnect: (credentialName: string, token?: string, orgId?: string) =>
        request<PagerDutyDisconnectResponse>(
            "/integrations/pagerduty/disconnect",
            { method: "POST", body: JSON.stringify({ credential_name: credentialName }) },
            token,
            orgId,
        ),
    preflight: (
        credentialName: string,
        enabledDatasets: readonly string[],
        token?: string,
        orgId?: string,
    ) =>
        request<PagerDutyPreflightResponse>(
            "/integrations/pagerduty/preflight",
            {
                method: "POST",
                body: JSON.stringify({
                    credential_name: credentialName,
                    enabled_datasets: enabledDatasets,
                }),
            },
            token,
            orgId,
        ),
    services: (credentialName: string, token?: string, orgId?: string) =>
        request<PagerDutyServicesResponse>(
            `/integrations/pagerduty/services?credential_name=${encodeURIComponent(credentialName)}`,
            {},
            token,
            orgId,
        ),
    clientCredentials: (
        input: {
            readonly credential_name: string;
            readonly client_id: string;
            readonly client_secret: string;
            readonly subdomain: string;
            readonly region: PagerDutyRegion;
        },
        token?: string,
        orgId?: string,
    ) =>
        request<PagerDutyClientCredentialsConnectedResponse>(
            "/integrations/pagerduty/client-credentials",
            { method: "POST", body: JSON.stringify(input) },
            token,
            orgId,
        ),
    apiToken: (
        input: {
            readonly credential_name: string;
            readonly api_token: string;
            readonly subdomain: string;
            readonly region: PagerDutyRegion;
        },
        token?: string,
        orgId?: string,
    ) =>
        request<PagerDutyApiTokenConnectedResponse>(
            "/integrations/pagerduty/api-token",
            { method: "POST", body: JSON.stringify(input) },
            token,
            orgId,
        ),
};

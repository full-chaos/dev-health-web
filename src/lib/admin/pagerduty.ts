export const PAGERDUTY_REGIONS = ["us", "eu"] as const;
export type PagerDutyRegion = (typeof PAGERDUTY_REGIONS)[number];

export const PAGERDUTY_PLANNER_DATASETS = [
    "services",
    "business-services",
    "escalation-policies",
    "schedules",
    "on-calls",
    "users",
    "teams",
    "incidents",
    "incident-alerts",
    "incident-log-entries",
    "incident-notes",
] as const;

export type PagerDutyPlannerDataset = (typeof PAGERDUTY_PLANNER_DATASETS)[number];
export type PagerDutyOAuthDataset =
    | "incidents"
    | "services"
    | "business_services"
    | "escalation_policies"
    | "schedules"
    | "oncalls"
    | "users"
    | "teams";

export type PagerDutyAuthMode = "oauth" | "client_credentials" | "api_token";

export type PagerDutyAuthorizeResponse = {
    readonly authorize_url: string;
};

export type PagerDutyOAuthCallbackConnectedResponse = {
    readonly connected: true;
    readonly credential_name: string;
    readonly region: string;
    readonly subdomain: string;
    readonly granted_scopes: readonly string[];
};

export type PagerDutyStatusResponse = {
    readonly connected: boolean;
    readonly credential_name: string;
    readonly auth_mode: string | null;
    readonly region: string | null;
    readonly subdomain: string | null;
    readonly account_id: string | null;
    readonly account_display: string | null;
    readonly granted_scopes: readonly string[];
    readonly expires_at: string | null;
    readonly has_refresh_token: boolean;
};

export type PagerDutyDisconnectResponse = {
    readonly disconnected: true;
    readonly credential_name: string;
};

export type PagerDutyDatasetPreflightResponse = {
    readonly requested: string;
    readonly required_scopes: readonly string[];
    readonly granted: boolean;
    readonly missing: readonly string[];
};

export type PagerDutyPreflightResponse = {
    readonly connected: boolean;
    readonly credential_name: string;
    readonly datasets: readonly PagerDutyDatasetPreflightResponse[];
};

export type PagerDutyServiceOption = {
    readonly external_id: string;
    readonly display_name: string;
    readonly name_resolved: boolean;
    readonly status: string | null;
};

export type PagerDutyServicesResponse = {
    readonly credential_name: string;
    readonly services: readonly PagerDutyServiceOption[];
};

export type PagerDutyClientCredentialsConnectedResponse = {
    readonly connected: true;
    readonly credential_name: string;
    readonly auth_mode: "client_credentials";
    readonly region: PagerDutyRegion;
    readonly subdomain: string;
};

export type PagerDutyApiTokenConnectedResponse = {
    readonly connected: true;
    readonly credential_name: string;
    readonly auth_mode: "api_token";
    readonly region: PagerDutyRegion;
    readonly subdomain: string;
};

export type ServiceRepositoryMappings = Record<
    string,
    readonly { readonly provider: string; readonly full_name: string }[]
>;

export function pagerDutyOAuthDatasets(
    selected: readonly PagerDutyPlannerDataset[],
): readonly PagerDutyOAuthDataset[] {
    const result = new Set<PagerDutyOAuthDataset>();
    for (const dataset of selected) {
        switch (dataset) {
            case "incidents":
            case "incident-alerts":
            case "incident-log-entries":
            case "incident-notes":
                result.add("incidents");
                break;
            case "services":
            case "business-services":
                result.add(dataset === "services" ? "services" : "business_services");
                break;
            case "escalation-policies":
                result.add("escalation_policies");
                break;
            case "on-calls":
                result.add("oncalls");
                break;
            default:
                result.add(dataset);
        }
    }
    return [...result];
}

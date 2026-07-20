import type { IntegrationCredential } from "@/lib/admin/types";
import {
    PAGERDUTY_PLANNER_DATASETS,
    PAGERDUTY_REGIONS,
    type PagerDutyAuthMode,
    type PagerDutyPlannerDataset,
    type PagerDutyRegion,
} from "@/lib/admin/pagerduty";

const DATASET_LABELS: Record<PagerDutyPlannerDataset, string> = {
    services: "Services",
    "business-services": "Business services",
    "escalation-policies": "Escalation policies",
    schedules: "Schedules",
    "on-calls": "On-call assignments",
    users: "Users",
    teams: "Teams",
    incidents: "Incidents",
    "incident-alerts": "Incident alerts",
    "incident-log-entries": "Incident timeline",
    "incident-notes": "Incident notes",
};

const CUSTOM_CREDENTIAL_VALUE = "__custom__";

type PagerDutySetupFieldsProps = {
    readonly credentials: readonly IntegrationCredential[];
    readonly credentialName: string;
    readonly authMode: PagerDutyAuthMode;
    readonly clientId: string;
    readonly clientSecret: string;
    readonly apiToken: string;
    readonly subdomain: string;
    readonly region: PagerDutyRegion;
    readonly datasets: readonly PagerDutyPlannerDataset[];
    readonly onCredentialNameChangeAction: (value: string) => void;
    readonly onAuthModeChangeAction: (value: PagerDutyAuthMode) => void;
    readonly onClientIdChangeAction: (value: string) => void;
    readonly onClientSecretChangeAction: (value: string) => void;
    readonly onApiTokenChangeAction: (value: string) => void;
    readonly onSubdomainChangeAction: (value: string) => void;
    readonly onRegionChangeAction: (value: string) => void;
    readonly onDatasetChangeAction: (dataset: PagerDutyPlannerDataset, checked: boolean) => void;
};

export function PagerDutySetupFields({
    credentials,
    credentialName,
    authMode,
    clientId,
    clientSecret,
    apiToken,
    subdomain,
    region,
    datasets,
    onCredentialNameChangeAction,
    onAuthModeChangeAction,
    onClientIdChangeAction,
    onClientSecretChangeAction,
    onApiTokenChangeAction,
    onSubdomainChangeAction,
    onRegionChangeAction,
    onDatasetChangeAction,
}: PagerDutySetupFieldsProps) {
    const selectedCredential = credentials.some(({ name }) => name === credentialName)
        ? credentialName
        : CUSTOM_CREDENTIAL_VALUE;

    return (
        <>
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-foreground">
                    Saved credentials
                    <select
                        className="mt-1 w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2"
                        value={selectedCredential}
                        onChange={(event) =>
                            onCredentialNameChangeAction(
                                event.target.value === CUSTOM_CREDENTIAL_VALUE
                                    ? ""
                                    : event.target.value,
                            )
                        }
                    >
                        <option value={CUSTOM_CREDENTIAL_VALUE}>
                            Use a custom credential name
                        </option>
                        {credentials.map((credential) => (
                            <option key={credential.id} value={credential.name}>
                                {credential.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-sm font-medium text-foreground">
                    Credential name
                    <input
                        className="mt-1 w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2"
                        value={credentialName}
                        onChange={(event) => onCredentialNameChangeAction(event.target.value)}
                    />
                </label>
                <label className="text-sm font-medium text-foreground">
                    Account subdomain
                    <input
                        className="mt-1 w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2"
                        value={subdomain}
                        onChange={(event) => onSubdomainChangeAction(event.target.value)}
                    />
                </label>
                <label className="text-sm font-medium text-foreground">
                    Region
                    <select
                        className="mt-1 w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2"
                        value={region}
                        onChange={(event) => onRegionChangeAction(event.target.value)}
                    >
                        {PAGERDUTY_REGIONS.map((option) => (
                            <option key={option} value={option}>
                                {option.toUpperCase()}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-foreground">
                    Authentication method
                </legend>
                <div className="flex flex-wrap gap-2">
                    {(["oauth", "client_credentials", "api_token"] as const).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            aria-pressed={authMode === mode}
                            onClick={() => onAuthModeChangeAction(mode)}
                            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) ${authMode === mode ? "border-(--accent) bg-(--accent)/10 text-(--accent)" : "border-(--card-stroke) text-foreground"}`}
                        >
                            <span>
                                {mode === "oauth"
                                    ? "OAuth (recommended)"
                                    : mode === "client_credentials"
                                      ? "Client credentials"
                                      : "Use API token instead"}
                            </span>
                            {authMode === mode ? (
                                <span
                                    aria-hidden="true"
                                    className="text-label-caps font-semibold uppercase"
                                >
                                    Selected
                                </span>
                            ) : null}
                        </button>
                    ))}
                </div>
                {authMode === "client_credentials" ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-medium text-foreground">
                            Client ID
                            <input
                                type="text"
                                className="mt-1 w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2"
                                value={clientId}
                                onChange={(event) => onClientIdChangeAction(event.target.value)}
                            />
                        </label>
                        <label className="text-sm font-medium text-foreground">
                            Client secret
                            <input
                                type="password"
                                className="mt-1 w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2"
                                value={clientSecret}
                                onChange={(event) => onClientSecretChangeAction(event.target.value)}
                            />
                        </label>
                    </div>
                ) : null}
                {authMode === "api_token" ? (
                    <label className="block text-sm font-medium text-foreground">
                        API token
                        <input
                            type="password"
                            className="mt-1 w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2"
                            value={apiToken}
                            onChange={(event) => onApiTokenChangeAction(event.target.value)}
                        />
                    </label>
                ) : null}
            </fieldset>
            <fieldset>
                <legend className="text-sm font-medium text-foreground">Datasets</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {PAGERDUTY_PLANNER_DATASETS.map((dataset) => (
                        <label
                            key={dataset}
                            className="flex items-center gap-2 rounded-lg border border-(--card-stroke) bg-(--card-70) p-3 text-sm text-foreground"
                        >
                            <input
                                type="checkbox"
                                checked={datasets.includes(dataset)}
                                onChange={(event) =>
                                    onDatasetChangeAction(dataset, event.target.checked)
                                }
                            />
                            {DATASET_LABELS[dataset]}
                        </label>
                    ))}
                </div>
            </fieldset>
        </>
    );
}

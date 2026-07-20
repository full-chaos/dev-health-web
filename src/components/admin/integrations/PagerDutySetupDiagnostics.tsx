import Link from "next/link";
import { CTA_LABELS } from "@/lib/design/cta";
import { SYNC_CONFIG_NEW_PATH } from "@/lib/onboarding/setupSurface";
import { DataState } from "@/components/ui/DataState";
import type {
    PagerDutyAuthMode,
    PagerDutyPreflightResponse,
    PagerDutyStatusResponse,
} from "@/lib/admin/pagerduty";
import { formatDateTimeUTC } from "@/lib/formatters";

export type PagerDutyDiagnosticError =
    | { readonly kind: "oauth"; readonly message: string }
    | { readonly kind: "credential"; readonly message: string }
    | { readonly kind: "status"; readonly message: string }
    | { readonly kind: "preflight"; readonly message: string }
    | { readonly kind: "disconnect"; readonly message: string };

const ERROR_COPY = {
    oauth: ["Could not start PagerDuty authorization", "Retry authorization"],
    credential: ["Could not save PagerDuty credential", "Retry credential save"],
    status: ["Connection status unavailable", "Retry status check"],
    preflight: ["PagerDuty permission check unavailable", "Retry preflight"],
    disconnect: ["Could not disconnect PagerDuty", "Retry disconnect"],
} as const satisfies Record<PagerDutyDiagnosticError["kind"], readonly [string, string]>;

type PagerDutySetupDiagnosticsProps = {
    readonly authMode: PagerDutyAuthMode;
    readonly status: PagerDutyStatusResponse | null;
    readonly preflight: PagerDutyPreflightResponse | null;
    readonly error: PagerDutyDiagnosticError | null;
    readonly isPending: boolean;
    readonly onConnectAction: () => void;
    readonly onSaveManualCredentialAction: () => void;
    readonly onRefreshStatusAction: () => void;
    readonly onRunPreflightAction: () => void;
    readonly onDisconnectAction: () => void;
};

function statusMessage(status: PagerDutyStatusResponse): string {
    if (!status.connected) return "Not connected";
    return status.account_display ?? status.subdomain ?? "Connected";
}

function authModeLabel(authMode: string | null): string {
    switch (authMode) {
        case "oauth":
            return "OAuth";
        case "client_credentials":
            return "Client credentials";
        case "api_token":
            return "API token";
        default:
            return "Not reported";
    }
}

function regionLabel(region: string | null): string {
    switch (region) {
        case "us":
            return "US";
        case "eu":
            return "EU";
        default:
            return "Not reported";
    }
}

function hasExpired(expiresAt: string | null): boolean {
    return expiresAt !== null && Date.parse(expiresAt) <= Date.now();
}

function expiryMessage(expiresAt: string | null): string {
    if (expiresAt === null) return "No expiry reported";
    if (hasExpired(expiresAt)) {
        return `Expired — reconnect or renew (${formatDateTimeUTC(expiresAt)})`;
    }
    return `Expires ${formatDateTimeUTC(expiresAt)}`;
}

export function PagerDutySetupDiagnostics({
    authMode,
    status,
    preflight,
    error,
    isPending,
    onConnectAction,
    onSaveManualCredentialAction,
    onRefreshStatusAction,
    onRunPreflightAction,
    onDisconnectAction,
}: PagerDutySetupDiagnosticsProps) {
    const errorCopy = error ? ERROR_COPY[error.kind] : null;
    const retryError = () => {
        if (!error) return;
        const actions: Record<PagerDutyDiagnosticError["kind"], () => void> = {
            oauth: onConnectAction,
            credential: onSaveManualCredentialAction,
            status: onRefreshStatusAction,
            preflight: onRunPreflightAction,
            disconnect: onDisconnectAction,
        };
        actions[error.kind]();
    };
    return (
        <>
            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    disabled={isPending}
                    onClick={authMode === "oauth" ? onConnectAction : onSaveManualCredentialAction}
                    className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-(--accent-foreground) disabled:opacity-50"
                >
                    {authMode === "oauth"
                        ? CTA_LABELS.connectPagerDuty
                        : CTA_LABELS.createCredential}
                </button>
                <button
                    type="button"
                    disabled={isPending}
                    onClick={onRefreshStatusAction}
                    className="rounded-lg border border-(--card-stroke) px-4 py-2 text-sm font-medium text-foreground disabled:opacity-50"
                >
                    {CTA_LABELS.checkConnectionStatus}
                </button>
                {status?.connected ? (
                    <>
                        <button
                            type="button"
                            disabled={isPending}
                            onClick={onRunPreflightAction}
                            className="rounded-lg border border-(--card-stroke) px-4 py-2 text-sm font-medium text-foreground disabled:opacity-50"
                        >
                            {CTA_LABELS.runPreflight}
                        </button>
                        <Link
                            href={SYNC_CONFIG_NEW_PATH}
                            className="rounded-lg border border-(--card-stroke) px-4 py-2 text-sm font-medium text-foreground"
                        >
                            {CTA_LABELS.createSyncConfig}
                        </Link>
                        <button
                            type="button"
                            disabled={isPending}
                            onClick={onDisconnectAction}
                            className="rounded-lg border border-(--negative) px-4 py-2 text-sm font-medium text-(--negative) disabled:opacity-50"
                        >
                            {CTA_LABELS.disconnect}
                        </button>
                    </>
                ) : null}
            </div>
            {error ? (
                <DataState
                    variant="error"
                    title={errorCopy?.[0] ?? "PagerDuty action unavailable"}
                    message={error.message}
                    action={
                        <button
                            type="button"
                            onClick={retryError}
                            className="rounded-lg border border-(--negative) px-3 py-2 text-sm font-medium text-(--negative)"
                        >
                            {errorCopy?.[1] ?? "Retry"}
                        </button>
                    }
                />
            ) : null}
            {status ? (
                <div role="status" className="space-y-1 text-sm text-(--ink-muted)">
                    <p>{statusMessage(status)}</p>
                    {status.connected ? (
                        <dl className="grid gap-1 text-xs sm:grid-cols-3">
                            <div>
                                <dt className="font-medium text-foreground">
                                    Authentication method
                                </dt>
                                <dd>{authModeLabel(status.auth_mode)}</dd>
                            </div>
                            <div>
                                <dt className="font-medium text-foreground">Region</dt>
                                <dd>{regionLabel(status.region)}</dd>
                            </div>
                            <div>
                                <dt className="font-medium text-foreground">Account</dt>
                                <dd>
                                    {status.account_display ?? status.subdomain ?? "Not reported"}
                                </dd>
                            </div>
                            <div>
                                <dt className="font-medium text-foreground">Granted scopes</dt>
                                <dd>
                                    {status.granted_scopes.length > 0
                                        ? status.granted_scopes.join(", ")
                                        : "No scopes reported"}
                                </dd>
                            </div>
                            <div>
                                <dt className="font-medium text-foreground">Credential expiry</dt>
                                <dd
                                    className={
                                        hasExpired(status.expires_at)
                                            ? "font-medium text-(--caution)"
                                            : undefined
                                    }
                                >
                                    {expiryMessage(status.expires_at)}
                                </dd>
                            </div>
                            <div>
                                <dt className="font-medium text-foreground">Refresh token</dt>
                                <dd>
                                    {status.has_refresh_token
                                        ? "Refresh token available"
                                        : "Refresh token unavailable"}
                                </dd>
                            </div>
                        </dl>
                    ) : null}
                </div>
            ) : null}
            {preflight ? (
                <section
                    aria-labelledby="pagerduty-preflight-heading"
                    aria-live="polite"
                    className="space-y-2 rounded-lg border border-(--card-stroke) bg-(--card-70) p-4"
                >
                    <h3 id="pagerduty-preflight-heading" className="text-h3 text-foreground">
                        Permission checks
                    </h3>
                    <ul className="space-y-2 text-sm text-(--ink-muted)">
                        {preflight.datasets.map((dataset) => (
                            <li key={dataset.requested}>
                                <p className="font-medium text-foreground">{dataset.requested}</p>
                                <p>{dataset.granted ? "Ready" : "Additional permissions needed"}</p>
                                {dataset.missing.length > 0 ? (
                                    <p>Missing scopes: {dataset.missing.join(", ")}</p>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
            <p className="text-xs text-(--ink-muted)">
                For private automation, use client credentials; for compatibility, use an API token
                instead in the credential form.
            </p>
        </>
    );
}

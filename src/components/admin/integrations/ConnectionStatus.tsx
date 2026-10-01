import React from "react";
import { STATUS_PILL, STATUS_DOT } from "@/lib/statusPill";
import { CREDENTIAL_STATUS_META } from "./credentialStatus";

export type ConnectionStatusType =
    "connected" | "error" | "not_configured" | "connecting" | "failing" | "untested" | "inactive";

type ConnectionStatusProps = {
    status: ConnectionStatusType;
    className?: string;
};

const BADGE_CLASSES: Record<ConnectionStatusType, string> = {
    connected: STATUS_PILL.positive,
    error: STATUS_PILL.negative,
    not_configured: STATUS_PILL.muted,
    connecting: STATUS_PILL.info,
    failing: STATUS_PILL.negative,
    untested: STATUS_PILL.caution,
    inactive: STATUS_PILL.muted,
};

const DOT_CLASSES: Record<ConnectionStatusType, string> = {
    connected: STATUS_DOT.positive,
    error: STATUS_DOT.negative,
    not_configured: STATUS_DOT.muted,
    connecting: `${STATUS_DOT.info} animate-pulse`,
    failing: STATUS_DOT.negative,
    untested: STATUS_DOT.caution,
    inactive: STATUS_DOT.muted,
};

// Labels for the credential-derived statuses come from the shared
// credentialStatus registry so a badge never drifts from CredentialCard /
// ProviderCredentialsList / the integrations list page's own copy.
const LABELS: Record<ConnectionStatusType, string> = {
    connected: CREDENTIAL_STATUS_META.connected.label,
    error: "Connection Error",
    not_configured: "Not Configured",
    connecting: "Connecting...",
    failing: CREDENTIAL_STATUS_META.failing.label,
    untested: CREDENTIAL_STATUS_META.untested.label,
    inactive: CREDENTIAL_STATUS_META.inactive.label,
};

export function ConnectionStatus({ status, className = "" }: ConnectionStatusProps) {
    return (
        <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${BADGE_CLASSES[status]} ${className}`}
        >
            <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${DOT_CLASSES[status]}`} />
            {LABELS[status]}
        </span>
    );
}

import React from "react";
import { CREDENTIAL_STATUS_META } from "./credentialStatus";

export type ConnectionStatusType =
    "connected" | "error" | "not_configured" | "connecting" | "failing" | "untested" | "inactive";

type ConnectionStatusProps = {
    status: ConnectionStatusType;
    className?: string;
};

const BADGE_CLASSES: Record<ConnectionStatusType, string> = {
    connected: "bg-green-100 text-green-700 border-green-200",
    error: "bg-red-100 text-red-700 border-red-200",
    not_configured: "bg-gray-100 text-gray-600 border-gray-200",
    connecting: "bg-blue-100 text-blue-700 border-blue-200",
    failing: "bg-red-100 text-red-700 border-red-200",
    untested: "bg-amber-100 text-amber-700 border-amber-200",
    inactive: "bg-gray-100 text-gray-600 border-gray-200",
};

const DOT_CLASSES: Record<ConnectionStatusType, string> = {
    connected: "bg-green-500",
    error: "bg-red-500",
    not_configured: "bg-gray-400",
    connecting: "bg-blue-500 animate-pulse",
    failing: "bg-red-500",
    untested: "bg-amber-500",
    inactive: "bg-gray-400",
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

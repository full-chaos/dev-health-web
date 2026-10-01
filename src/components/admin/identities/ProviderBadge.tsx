import React from "react";
import { STATUS_PILL } from "@/lib/statusPill";

type ProviderBadgeProps = {
    provider: string;
    username: string;
};

export function ProviderBadge({ provider, username }: ProviderBadgeProps) {
    // A provider is an identity, not a status: one plain pill for all of them.
    const colorClass = STATUS_PILL.muted;

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
        >
            <span className="capitalize">{provider}</span>: {username}
        </span>
    );
}

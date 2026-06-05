import React from "react";

type ProviderBadgeProps = {
    provider: string;
    username: string;
};

const PROVIDER_COLORS: Record<string, string> = {
    github: "bg-gray-800 text-white",
    gitlab: "bg-orange-600 text-white",
    jira: "bg-blue-600 text-white",
    email: "bg-green-600 text-white",
};

export function ProviderBadge({ provider, username }: ProviderBadgeProps) {
    const colorClass = PROVIDER_COLORS[provider.toLowerCase()] || "bg-gray-500 text-white";

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
        >
            <span className="capitalize">{provider}</span>: {username}
        </span>
    );
}

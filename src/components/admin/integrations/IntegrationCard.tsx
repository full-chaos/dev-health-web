import React from "react";
import Link from "next/link";
import { ConnectionStatus, ConnectionStatusType } from "./ConnectionStatus";

export type IntegrationProvider = {
    id: string;
    name: string;
    description: string;
    icon: React.ReactNode;
    status: ConnectionStatusType;
    credentialCount: number;
};

type IntegrationCardProps = {
    provider: IntegrationProvider;
};

export function IntegrationCard({ provider }: IntegrationCardProps) {
    return (
        <div className="flex flex-col justify-between rounded-lg border border-(--border-subtle) bg-(--surface-base) p-6 shadow-sm transition-shadow hover:shadow-md">
            <div>
                <div className="mb-4 flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-md bg-(--surface-muted)">
                        {provider.icon}
                    </div>
                    <div className="flex items-center gap-2">
                        {provider.credentialCount > 0 && (
                            <span className="inline-flex items-center rounded-full bg-(--surface-muted) px-2.5 py-0.5 text-xs font-medium text-(--ink-base)">
                                {provider.credentialCount} credential
                                {provider.credentialCount === 1 ? "" : "s"}
                            </span>
                        )}
                        <ConnectionStatus status={provider.status} />
                    </div>
                </div>
                <h3 className="mb-2 text-lg font-semibold text-(--ink-base)">{provider.name}</h3>
                <p className="mb-6 text-sm text-(--ink-muted)">{provider.description}</p>
            </div>
            <div className="mt-auto">
                <Link
                    href={`/org/admin/integrations/${provider.id}`}
                    className="inline-flex w-full items-center justify-center rounded-md bg-(--surface-inverted) px-4 py-2 text-sm font-medium text-(--ink-inverted) hover:bg-(--surface-inverted)/90 focus:outline-none focus:ring-2 focus:ring-(--surface-inverted) focus:ring-offset-2"
                >
                    Configure
                </Link>
            </div>
        </div>
    );
}

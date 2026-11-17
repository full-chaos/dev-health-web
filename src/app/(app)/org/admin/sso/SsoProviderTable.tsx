"use client";

import { useState } from "react";
import { CircleCheck, CircleSlash, KeyRound } from "lucide-react";

import { StatusPill } from "@/components/admin/StatusPill";
import { Button } from "@/components/shared/Button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DataState } from "@/components/ui/DataState";
import { CTA_LABELS } from "@/lib/design/cta";
import type { SsoProvider } from "@/lib/admin/types";

type SsoProviderTableProps = {
    providers: SsoProvider[];
    /** False for a read-only view: no edit, activate or delete buttons. */
    canWrite: boolean;
    busyId: string | null;
    onEditAction: (provider: SsoProvider) => void;
    onToggleAction: (provider: SsoProvider) => void;
    onDeleteAction: (provider: SsoProvider) => void;
    formatDate: (d: string | null) => string;
};

/** Table of SSO providers. It shows no part of the client secret. */
export function SsoProviderTable({
    providers,
    canWrite,
    busyId,
    onEditAction,
    onToggleAction,
    onDeleteAction,
    formatDate,
}: SsoProviderTableProps) {
    const [confirmToggle, setConfirmToggle] = useState<SsoProvider | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<SsoProvider | null>(null);

    if (providers.length === 0) {
        return (
            <DataState
                variant="detector-enabled-no-findings"
                icon={<KeyRound aria-hidden="true" />}
                title="No SSO providers configured."
                description="Add an OIDC or SAML provider so members can sign in with your identity provider."
            />
        );
    }

    const toggleLabel = (provider: SsoProvider | null) =>
        provider?.status === "active"
            ? CTA_LABELS.deactivateSsoProvider
            : CTA_LABELS.activateSsoProvider;

    return (
        <>
            <div className="overflow-x-auto rounded-(--radius-md) border border-(--card-stroke)">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-(--card-stroke) bg-background text-label-caps uppercase text-(--ink-muted)">
                            <th className="px-4 py-3 text-left font-medium">Name</th>
                            <th className="px-4 py-3 text-left font-medium">Protocol</th>
                            <th className="px-4 py-3 text-left font-medium">Last sign-in</th>
                            <th className="px-4 py-3 text-left font-medium">Last error</th>
                            {canWrite ? (
                                <th className="px-4 py-3 text-right font-medium">Actions</th>
                            ) : null}
                        </tr>
                    </thead>
                    <tbody>
                        {providers.map((provider) => (
                            <tr
                                key={provider.id}
                                className="border-b border-(--card-stroke) last:border-0"
                            >
                                <td className="px-4 py-3">
                                    <div className="flex flex-col items-start gap-1">
                                        <span className="font-medium">{provider.name}</span>
                                        {provider.status === "active" ? (
                                            <StatusPill tone="positive" icon={CircleCheck}>
                                                Active
                                            </StatusPill>
                                        ) : (
                                            <StatusPill tone="negative" icon={CircleSlash}>
                                                Inactive
                                            </StatusPill>
                                        )}
                                        {provider.is_default ? (
                                            <StatusPill tone="outline">Default</StatusPill>
                                        ) : null}
                                    </div>
                                </td>
                                <td className="px-4 py-3 uppercase text-(--ink-muted)">
                                    {provider.protocol}
                                </td>
                                <td className="px-4 py-3 text-(--ink-muted)">
                                    {formatDate(provider.last_login_at)}
                                </td>
                                <td className="px-4 py-3 text-(--ink-muted)">
                                    {provider.last_error ? (
                                        <div>
                                            <div>{provider.last_error}</div>
                                            <div className="mt-0.5 text-xs">
                                                {formatDate(provider.last_error_at)}
                                            </div>
                                        </div>
                                    ) : (
                                        "—"
                                    )}
                                </td>
                                {canWrite ? (
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Button
                                                size="sm"
                                                onClick={() => onEditAction(provider)}
                                            >
                                                {CTA_LABELS.edit}
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={() => setConfirmToggle(provider)}
                                                disabled={busyId === provider.id}
                                            >
                                                {toggleLabel(provider)}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="danger"
                                                onClick={() => setConfirmDelete(provider)}
                                            >
                                                {CTA_LABELS.delete}
                                            </Button>
                                        </div>
                                    </td>
                                ) : null}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <ConfirmDialog
                isOpen={canWrite && confirmToggle !== null}
                title={
                    confirmToggle?.status === "active"
                        ? "Deactivate this SSO provider?"
                        : "Activate this SSO provider?"
                }
                tone={confirmToggle?.status === "active" ? "destructive" : "default"}
                description={
                    confirmToggle?.status === "active"
                        ? `Members can no longer sign in with ${confirmToggle?.name ?? ""} until it is active again.`
                        : `Members can sign in with ${confirmToggle?.name ?? ""} once it is active.`
                }
                confirmLabel={toggleLabel(confirmToggle)}
                isPending={busyId === confirmToggle?.id}
                onConfirmAction={() => {
                    if (canWrite && confirmToggle) onToggleAction(confirmToggle);
                    setConfirmToggle(null);
                }}
                onCancelAction={() => setConfirmToggle(null)}
            />

            <ConfirmDialog
                isOpen={canWrite && confirmDelete !== null}
                title="Delete this SSO provider?"
                tone="destructive"
                description={`This permanently removes ${confirmDelete?.name ?? ""}. Members who signed in with it must use another sign-in method. This cannot be undone.`}
                confirmLabel={CTA_LABELS.delete}
                onConfirmAction={() => {
                    if (canWrite && confirmDelete) onDeleteAction(confirmDelete);
                    setConfirmDelete(null);
                }}
                onCancelAction={() => setConfirmDelete(null)}
            />
        </>
    );
}

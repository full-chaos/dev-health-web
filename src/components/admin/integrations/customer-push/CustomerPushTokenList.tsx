"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { rotateCustomerPushToken, revokeCustomerPushToken } from "@/lib/admin/server";
import { TokenRevealPanel } from "./TokenRevealPanel";
import { TruncatedId } from "./TruncatedId";
import { CTA_LABELS } from "@/lib/design/cta";
import {
    deriveTokenStatus,
    TOKEN_STATUS_LABELS,
    type CustomerPushTokenStatus,
} from "@/lib/customer-push/token-status";
import type { CustomerPushToken, CustomerPushTokenCreateResponse } from "@/lib/admin/types";

type CustomerPushTokenListProps = {
    tokens: CustomerPushToken[];
    newTokenHref: string;
    examplesHref: string;
};

const STATUS_STYLES: Record<CustomerPushTokenStatus, string> = {
    active: "bg-green-100 text-green-700 border-green-200",
    revoked: "bg-red-100 text-red-700 border-red-200",
    expired: "bg-gray-100 text-gray-600 border-gray-200",
    never_used: "bg-blue-100 text-blue-700 border-blue-200",
};

function TokenStatusBadge({ status }: { status: CustomerPushTokenStatus }) {
    return (
        <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
        >
            {TOKEN_STATUS_LABELS[status]}
        </span>
    );
}

function formatTimestamp(value: string | null) {
    if (!value) return "—";
    return new Date(value).toLocaleString();
}

function TokenRow({ token, examplesHref }: { token: CustomerPushToken; examplesHref: string }) {
    const router = useRouter();
    const [isRotating, startRotating] = useTransition();
    const [isRevoking, startRevoking] = useTransition();
    const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
    const [rotated, setRotated] = useState<CustomerPushTokenCreateResponse | null>(null);
    const [revoked, setRevoked] = useState(false);

    const status = revoked ? "revoked" : deriveTokenStatus(token);
    const isBusy = isRotating || isRevoking;

    const handleRotate = () => {
        startRotating(async () => {
            const result = await rotateCustomerPushToken(token.id);
            if (result.error) {
                toast.error(result.error);
            } else if (result.data) {
                setRotated(result.data);
                toast.success("Token rotated");
            }
        });
    };

    const handleRevoke = () => {
        startRevoking(async () => {
            const result = await revokeCustomerPushToken(token.id);
            if (result.error) {
                toast.error(result.error);
            } else {
                setRevoked(true);
                setShowRevokeConfirm(false);
                toast.success("Token revoked");
            }
        });
    };

    if (rotated) {
        return (
            <TokenRevealPanel
                token={rotated.token}
                name={rotated.name}
                scopes={rotated.scopes}
                examplesHref={examplesHref}
                onDismiss={() => {
                    setRotated(null);
                    // Real backend hard-cutover (Design Decision 16): rotate
                    // revokes this row and mints a NEW token id — refresh so
                    // the list reflects the new row rather than staying on
                    // the stale pre-rotation snapshot.
                    router.refresh();
                }}
            />
        );
    }

    return (
        <div
            data-testid={`token-row-${token.id}`}
            className="flex flex-col gap-3 rounded-lg border border-(--border-subtle) bg-(--surface-base) p-4 sm:flex-row sm:items-center sm:justify-between"
        >
            <div>
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-(--ink-base)">{token.name}</h3>
                    <TokenStatusBadge status={status} />
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                    {token.scopes.map((scope) => (
                        <span
                            key={scope}
                            className="rounded-full bg-(--card-70) px-2 py-0.5 text-xs font-mono text-(--ink-muted)"
                        >
                            {scope}
                        </span>
                    ))}
                </div>
                <p className="mt-1.5 text-xs text-(--ink-muted)">
                    Last used: {formatTimestamp(token.last_used_at)} · Created:{" "}
                    {formatTimestamp(token.created_at)}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-mono text-xs text-(--ink-muted)">
                        {token.token_prefix}…
                    </span>
                    <TruncatedId value={token.id} label="Token ID" readOnly />
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={handleRotate}
                    disabled={isBusy || status === "revoked"}
                    className="inline-flex items-center justify-center rounded-md border border-(--border-subtle) bg-(--surface-base) px-3 py-1.5 text-sm font-medium text-(--ink-base) hover:bg-(--surface-muted) disabled:opacity-50"
                >
                    {isRotating ? "Rotating..." : CTA_LABELS.rotate}
                </button>
                <button
                    type="button"
                    onClick={() => setShowRevokeConfirm(true)}
                    disabled={isBusy || status === "revoked"}
                    className="inline-flex items-center justify-center rounded-md border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-500/20 disabled:opacity-50"
                >
                    {CTA_LABELS.revoke}
                </button>
            </div>

            {showRevokeConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-xl border border-(--card-stroke) bg-(--card) p-6 shadow-2xl">
                        <h3 className="mb-4 text-lg font-semibold text-(--foreground)">
                            Revoke credential
                        </h3>
                        <p className="mb-6 text-sm text-(--ink-muted)">
                            Are you sure you want to revoke <strong>{token.name}</strong>? Any
                            runner using this token will immediately lose access.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowRevokeConfirm(false)}
                                disabled={isRevoking}
                                className="rounded-md border border-(--card-stroke) px-4 py-2 text-sm hover:bg-(--card-80) disabled:opacity-50"
                            >
                                {CTA_LABELS.cancel}
                            </button>
                            <button
                                type="button"
                                onClick={handleRevoke}
                                disabled={isRevoking}
                                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                                {isRevoking ? "Revoking..." : CTA_LABELS.revoke}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export function CustomerPushTokenList({
    tokens,
    newTokenHref,
    examplesHref,
}: CustomerPushTokenListProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-(--ink-base)">Credentials</h2>
                <Link
                    href={newTokenHref}
                    className="inline-flex items-center justify-center rounded-md bg-(--surface-inverted) px-4 py-2 text-sm font-medium text-(--ink-inverted) hover:bg-(--surface-inverted)/90"
                >
                    {CTA_LABELS.createCredential}
                </Link>
            </div>

            {tokens.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-(--border-subtle) bg-(--surface-base) py-12 text-center">
                    <h3 className="mb-2 text-lg font-medium text-(--ink-base)">
                        No credentials yet for this source
                    </h3>
                    <p className="mb-6 text-sm text-(--ink-muted)">
                        Create an ingest credential so your CI/CD job or relay can push data.
                    </p>
                    <Link
                        href={newTokenHref}
                        className="inline-flex items-center justify-center rounded-md bg-(--surface-inverted) px-4 py-2 text-sm font-medium text-(--ink-inverted) hover:bg-(--surface-inverted)/90"
                    >
                        {CTA_LABELS.createCredential}
                    </Link>
                </div>
            ) : (
                <div className="space-y-3">
                    {tokens.map((token) => (
                        <TokenRow key={token.id} token={token} examplesHref={examplesHref} />
                    ))}
                </div>
            )}
        </div>
    );
}

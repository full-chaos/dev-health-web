"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCustomerPushSource } from "@/lib/admin/server";
import { CTA_LABELS } from "@/lib/design/cta";
import type { CustomerPushSystem } from "@/lib/admin/types";

type CreateCustomerPushSourceFormProps = {
    provider: string;
    providerName: string;
};

const MISSING_INSTANCE_COPY =
    "Enter a stable provider instance so incoming records can be scoped and deduplicated.";

function instanceFieldCopy(system: CustomerPushSystem): { label: string; placeholder: string } {
    switch (system) {
        case "github":
        case "gitlab":
            return { label: "Repository full name (owner/repo)", placeholder: "acme/api" };
        case "jira":
            return { label: "Project key", placeholder: "ABC" };
        case "linear":
            return { label: "Team key", placeholder: "CHAOS" };
        default:
            return { label: "Stable source id", placeholder: "acme-internal-tracker" };
    }
}

/**
 * True when a create-source error looks like a one-active-owner conflict.
 * Verified against the real ops router (api/admin/routers/customer_push.py
 * `_resolve_ownership`), there are two distinct 409 paths with different
 * detail shapes:
 *   - managed-sync ownership: `{"code": "source_owned_by_fullchaos_sync",
 *     "message": "A managed {system} sync source already owns '{instance}'
 *     ..."}` — a dict, unwrapped to plain prose by `_request.ts`.
 *   - duplicate customer-push registration (unique constraint): a plain
 *     string, "A source is already registered for system='{system}'
 *     instance='{instance}' in this organization".
 * Both render the real backend message verbatim (not a hardcoded copy) —
 * given there are two distinct real messages, substituting one fixed string
 * would misrepresent whichever case didn't match it.
 */
function isOwnershipConflict(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
        normalized.includes("already owns") ||
        normalized.includes("already registered") ||
        normalized.includes("owned_by_fullchaos_sync")
    );
}

export function CreateCustomerPushSourceForm({
    provider,
    providerName,
}: CreateCustomerPushSourceFormProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [displayName, setDisplayName] = useState("");
    const [instance, setInstance] = useState("");
    const [instanceError, setInstanceError] = useState<string | null>(null);
    const [conflictError, setConflictError] = useState<string | null>(null);
    const [genericError, setGenericError] = useState<string | null>(null);

    const system = provider as CustomerPushSystem;
    const { label: instanceLabel, placeholder: instancePlaceholder } = instanceFieldCopy(system);

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setInstanceError(null);
        setConflictError(null);
        setGenericError(null);

        if (instance.trim().length === 0) {
            setInstanceError(MISSING_INSTANCE_COPY);
            return;
        }

        startTransition(async () => {
            const result = await createCustomerPushSource({
                system,
                instance: instance.trim(),
                display_name: displayName.trim() || instance.trim(),
            });

            if (result.error) {
                if (isOwnershipConflict(result.error)) {
                    setConflictError(result.error);
                } else {
                    setGenericError(result.error);
                }
                return;
            }

            if (result.data) {
                router.push(`/org/admin/integrations/${provider}/customer-push/${result.data.id}`);
            }
        });
    };

    return (
        <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
            {conflictError && (
                <div
                    role="alert"
                    className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-500"
                >
                    <p className="font-medium">One-active-owner conflict</p>
                    <p className="mt-1">{conflictError}</p>
                </div>
            )}
            {genericError && (
                <div
                    role="alert"
                    className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-500"
                >
                    {genericError}
                </div>
            )}

            <div>
                <label
                    htmlFor="customer-push-display-name"
                    className="mb-1.5 block text-sm font-medium text-(--ink-base)"
                >
                    Source display name
                </label>
                <input
                    id="customer-push-display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={`${providerName} — ${instancePlaceholder}`}
                    className="w-full rounded-md border border-(--border-subtle) bg-(--surface-base) px-3 py-2 text-sm text-(--ink-base) focus:border-(--accent) focus:outline-none"
                />
            </div>

            <div>
                <label
                    htmlFor="customer-push-instance"
                    className="mb-1.5 block text-sm font-medium text-(--ink-base)"
                >
                    {instanceLabel}
                </label>
                <input
                    id="customer-push-instance"
                    type="text"
                    value={instance}
                    onChange={(e) => setInstance(e.target.value)}
                    placeholder={instancePlaceholder}
                    className="w-full rounded-md border border-(--border-subtle) bg-(--surface-base) px-3 py-2 text-sm text-(--ink-base) focus:border-(--accent) focus:outline-none"
                />
                {instanceError && <p className="mt-1.5 text-sm text-red-500">{instanceError}</p>}
            </div>

            <div className="rounded-lg border border-(--border-subtle) bg-(--surface-base) p-4 text-sm text-(--ink-muted)">
                <p className="font-medium text-(--ink-base)">Ingestion mode: Customer push</p>
                <p className="mt-1">
                    Only one mode can own this source instance at a time. Managed sync and customer
                    push cannot both own the same {instanceLabel.toLowerCase()}.
                </p>
            </div>

            <div className="flex items-center gap-3">
                <button
                    type="submit"
                    disabled={isPending}
                    className="inline-flex items-center justify-center rounded-md bg-(--surface-inverted) px-4 py-2 text-sm font-medium text-(--ink-inverted) hover:bg-(--surface-inverted)/90 disabled:opacity-50"
                >
                    {isPending ? "Creating..." : CTA_LABELS.createCustomerPushSource}
                </button>
            </div>
        </form>
    );
}

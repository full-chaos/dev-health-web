"use client";

import { useState, useTransition } from "react";
import { createCustomerPushToken } from "@/lib/admin/server";
import { CTA_LABELS } from "@/lib/design/cta";
import { TokenRevealPanel } from "./TokenRevealPanel";
import type { CustomerPushScope, CustomerPushTokenCreateResponse } from "@/lib/admin/types";

type CreateCustomerPushTokenFormProps = {
    sourceId: string;
    examplesHref: string;
    credentialsHref: string;
};

const V1_SCOPES: { scope: CustomerPushScope; description: string }[] = [
    { scope: "schema:read", description: "Read the record schema and validate payloads." },
    { scope: "ingest:write", description: "Push batches of normalized records." },
    { scope: "ingest:status", description: "Read ingest batch status and rejected records." },
];

// D7: provider-specific scopes are shown (so the intended scope model is
// visible) but rendered disabled — they are not wired to any state and are
// never sent to the API.
const PROVIDER_SCOPES = ["ingest:github", "ingest:gitlab", "ingest:jira", "ingest:linear"];

export function CreateCustomerPushTokenForm({
    sourceId,
    examplesHref,
    credentialsHref,
}: CreateCustomerPushTokenFormProps) {
    const [isPending, startTransition] = useTransition();
    const [name, setName] = useState("");
    const [expiresAt, setExpiresAt] = useState("");
    const [scopes, setScopes] = useState<CustomerPushScope[]>([
        "schema:read",
        "ingest:write",
        "ingest:status",
    ]);
    const [error, setError] = useState<string | null>(null);
    const [created, setCreated] = useState<CustomerPushTokenCreateResponse | null>(null);

    const toggleScope = (scope: CustomerPushScope) => {
        setScopes((prev) =>
            prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
        );
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);

        startTransition(async () => {
            const result = await createCustomerPushToken(sourceId, {
                name: name.trim() || "CI runner",
                scopes,
                expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
            });

            if (result.error) {
                setError(result.error);
                return;
            }

            if (result.data) {
                setCreated(result.data);
            }
        });
    };

    if (created) {
        return (
            <TokenRevealPanel
                token={created.token}
                name={created.name}
                scopes={created.scopes}
                examplesHref={examplesHref}
                onDismiss={() => setCreated(null)}
            />
        );
    }

    return (
        <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
            {error && (
                <div
                    role="alert"
                    className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-500"
                >
                    {error}
                </div>
            )}

            <div>
                <label
                    htmlFor="customer-push-token-name"
                    className="mb-1.5 block text-sm font-medium text-(--ink-base)"
                >
                    Credential name
                </label>
                <input
                    id="customer-push-token-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="CI runner"
                    className="w-full rounded-md border border-(--border-subtle) bg-(--surface-base) px-3 py-2 text-sm text-(--ink-base) focus:border-(--accent) focus:outline-none"
                />
            </div>

            <div>
                <span className="mb-1.5 block text-sm font-medium text-(--ink-base)">Scopes</span>
                <div className="space-y-2">
                    {V1_SCOPES.map(({ scope, description }) => (
                        <label
                            key={scope}
                            className="flex items-start gap-2.5 rounded-md border border-(--border-subtle) bg-(--surface-base) p-3"
                        >
                            <input
                                type="checkbox"
                                checked={scopes.includes(scope)}
                                onChange={() => toggleScope(scope)}
                                className="mt-0.5"
                            />
                            <span>
                                <span className="block font-mono text-sm text-(--ink-base)">
                                    {scope}
                                </span>
                                <span className="block text-xs text-(--ink-muted)">
                                    {description}
                                </span>
                            </span>
                        </label>
                    ))}
                </div>
            </div>

            <div>
                <span className="mb-1.5 block text-sm font-medium text-(--ink-muted)">
                    Provider-specific scopes (coming soon)
                </span>
                <div className="flex flex-wrap gap-2">
                    {PROVIDER_SCOPES.map((scope) => (
                        <span
                            key={scope}
                            title="Coming soon"
                            className="flex cursor-not-allowed items-center gap-1.5 rounded-full border border-(--border-subtle) px-3 py-1 text-xs font-mono text-(--ink-muted) opacity-50"
                        >
                            <input type="checkbox" disabled className="cursor-not-allowed" />
                            {scope}
                        </span>
                    ))}
                </div>
            </div>

            <div>
                <label
                    htmlFor="customer-push-token-expires"
                    className="mb-1.5 block text-sm font-medium text-(--ink-base)"
                >
                    Expiration (optional)
                </label>
                <input
                    id="customer-push-token-expires"
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full rounded-md border border-(--border-subtle) bg-(--surface-base) px-3 py-2 text-sm text-(--ink-base) focus:border-(--accent) focus:outline-none"
                />
            </div>

            <div className="flex items-center gap-3">
                <button
                    type="submit"
                    disabled={isPending || scopes.length === 0}
                    className="inline-flex items-center justify-center rounded-md bg-(--surface-inverted) px-4 py-2 text-sm font-medium text-(--ink-inverted) hover:bg-(--surface-inverted)/90 disabled:opacity-50"
                >
                    {isPending ? "Creating..." : "Create credential"}
                </button>
                <a
                    href={credentialsHref}
                    className="text-sm text-(--ink-muted) hover:text-foreground"
                >
                    {CTA_LABELS.cancel}
                </a>
            </div>
        </form>
    );
}

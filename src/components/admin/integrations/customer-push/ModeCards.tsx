import Link from "next/link";
import { CTA_LABELS } from "@/lib/design/cta";

type ModeCardsProps = {
    provider: string;
    providerName: string;
    /** False for `custom` — there is no managed-sync equivalent (D3/D4). */
    showManagedSync: boolean;
    customerPushSourceCount: number;
};

/**
 * Screen 1 mode-choice cards. Static/server-rendered — no client state.
 * The managed-sync CTA scroll-anchors into the existing credentials section
 * further down this same page (ProviderCredentialsList owns the actual
 * add-connection flow); the customer-push CTA either starts a new source or
 * scroll-anchors into the existing customer-push source list.
 */
export function ModeCards({
    provider,
    providerName,
    showManagedSync,
    customerPushSourceCount,
}: ModeCardsProps) {
    const customerPushHref =
        customerPushSourceCount === 0
            ? `/org/admin/integrations/${provider}/customer-push/new`
            : "#customer-push-sources";

    return (
        <div className="mb-8 grid gap-6 md:grid-cols-2">
            {showManagedSync && (
                <div className="flex flex-col justify-between rounded-lg border border-(--border-subtle) bg-(--surface-base) p-6 shadow-sm">
                    <div>
                        <h3 className="text-lg font-semibold text-(--ink-base)">Managed sync</h3>
                        <ul className="mt-3 space-y-1.5 text-sm text-(--ink-muted)">
                            <li>FullChaos stores your {providerName} credentials.</li>
                            <li>FullChaos schedules and runs {providerName} syncs.</li>
                            <li>Best for fastest setup.</li>
                        </ul>
                    </div>
                    <a
                        href="#managed-sync-credentials"
                        className="mt-6 inline-flex items-center justify-center rounded-md border border-(--border-subtle) bg-(--surface-base) px-4 py-2 text-sm font-medium text-(--ink-base) hover:bg-(--surface-muted)"
                    >
                        {CTA_LABELS.setUpManagedSync}
                    </a>
                </div>
            )}

            <div className="flex flex-col justify-between rounded-lg border border-(--border-subtle) bg-(--surface-base) p-6 shadow-sm">
                <div>
                    <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-(--ink-base)">Customer push</h3>
                        <span className="rounded-full border border-(--border-subtle) px-2 py-0.5 text-xs font-medium text-(--ink-muted)">
                            Webhook relay: Experimental
                        </span>
                    </div>
                    <ul className="mt-3 space-y-1.5 text-sm text-(--ink-muted)">
                        <li>You keep {providerName} credentials outside FullChaos.</li>
                        <li>You send normalized data with an ingest token.</li>
                        <li>Works from CI/CD, cron, ETL, or a webhook relay.</li>
                        <li>Requires setting up a source, credential, and runner.</li>
                    </ul>
                </div>
                <Link
                    href={customerPushHref}
                    className="mt-6 inline-flex items-center justify-center rounded-md bg-(--surface-inverted) px-4 py-2 text-sm font-medium text-(--ink-inverted) hover:bg-(--surface-inverted)/90"
                >
                    {CTA_LABELS.setUpCustomerPush}
                </Link>
            </div>
        </div>
    );
}

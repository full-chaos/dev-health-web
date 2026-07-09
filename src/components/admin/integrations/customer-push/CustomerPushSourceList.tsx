import Link from "next/link";
import { ConnectionStatus } from "@/components/admin/integrations/ConnectionStatus";
import { TruncatedId } from "./TruncatedId";
import { CTA_LABELS } from "@/lib/design/cta";
import type { CustomerPushSource } from "@/lib/admin/types";

type CustomerPushSourceListProps = {
    provider: string;
    providerName: string;
    sources: CustomerPushSource[];
};

export function CustomerPushSourceList({
    provider,
    providerName,
    sources,
}: CustomerPushSourceListProps) {
    return (
        <div id="customer-push-sources" className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-(--ink-base)">Customer-push sources</h2>
                <Link
                    href={`/org/admin/integrations/${provider}/customer-push/new`}
                    className="inline-flex items-center justify-center rounded-md border border-(--border-subtle) bg-(--surface-base) px-4 py-2 text-sm font-medium text-(--ink-base) hover:bg-(--surface-muted)"
                >
                    {CTA_LABELS.createCustomerPushSource}
                </Link>
            </div>

            {sources.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-(--border-subtle) bg-(--surface-base) py-12 text-center">
                    <h3 className="mb-2 text-lg font-medium text-(--ink-base)">
                        No customer-push sources yet
                    </h3>
                    <p className="mb-6 text-sm text-(--ink-muted)">
                        Register a {providerName} source to push data without granting FullChaos
                        long-lived credentials.
                    </p>
                    <Link
                        href={`/org/admin/integrations/${provider}/customer-push/new`}
                        className="inline-flex items-center justify-center rounded-md bg-(--surface-inverted) px-4 py-2 text-sm font-medium text-(--ink-inverted) hover:bg-(--surface-inverted)/90"
                    >
                        {CTA_LABELS.createCustomerPushSource}
                    </Link>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {sources.map((source) => {
                        const displayName = source.display_name || source.instance;
                        return (
                            <Link
                                key={source.id}
                                href={`/org/admin/integrations/${provider}/customer-push/${source.id}`}
                                className="flex flex-col justify-between rounded-lg border border-(--border-subtle) bg-(--surface-base) p-6 shadow-sm transition-shadow hover:shadow-md"
                            >
                                <div>
                                    <div className="mb-3 flex items-center justify-between">
                                        <h3 className="text-base font-semibold text-(--ink-base)">
                                            {displayName}
                                        </h3>
                                        <ConnectionStatus
                                            status={
                                                source.warnings.length > 0
                                                    ? "connecting"
                                                    : source.enabled
                                                      ? "connected"
                                                      : "not_configured"
                                            }
                                        />
                                    </div>
                                    <p className="text-sm text-(--ink-muted)">{source.instance}</p>
                                </div>
                                <div className="mt-4">
                                    <TruncatedId value={source.id} label="Source ID" readOnly />
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

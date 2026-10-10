import Link from "next/link";
import { ConnectionStatus } from "@/components/admin/integrations/ConnectionStatus";
import type { CustomerPushSource } from "@/lib/admin/types";
import { appPath } from "@/lib/navigation/appPath";

type CustomerPushSourceOverviewProps = {
    provider: string;
    source: CustomerPushSource;
};

const LINK_CARDS = [
    {
        segment: "credentials",
        title: "Credentials",
        description: "Create, rotate, and revoke ingest tokens for this source.",
    },
    {
        segment: "examples",
        title: "Runner setup examples",
        description: "GitHub Actions, GitLab Runner, Docker/cron, cURL, and webhook relay.",
    },
    {
        segment: "validate",
        title: "Validate payload",
        description: "Check a sample or real payload against the schema before your first push.",
    },
    {
        segment: "batches",
        title: "Ingest status",
        description: "See accepted, processing, completed, and failed batches.",
    },
] as const;

export function CustomerPushSourceOverview({ provider, source }: CustomerPushSourceOverviewProps) {
    const basePath = appPath("/org/admin/integrations/[provider]/customer-push/[source_id]", {
        provider,
        source_id: source.id,
    });
    const displayName = source.display_name || source.instance;

    return (
        <div className="space-y-6">
            {/* Non-blocking managed-sync-adjacent warnings (verified:
                IngestSourceResponse.warnings, populated on writes). A
                blocking one-active-owner conflict is instead a 409 at
                creation time, surfaced by the create-source form. */}
            {source.warnings.map((warning) => (
                <div
                    key={warning}
                    role="alert"
                    className="rounded-lg border border-(--caution)/30 bg-(--caution)/12 p-4 text-sm text-(--caution)"
                >
                    {warning}
                </div>
            ))}

            <div className="grid gap-6 md:grid-cols-3">
                <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                    <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                        Instance
                    </h3>
                    <p className="mt-2 text-lg font-medium text-foreground">{source.instance}</p>
                    <p className="mt-1 text-sm text-(--ink-muted)">{displayName}</p>
                </div>

                <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                    <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                        Mode
                    </h3>
                    <p className="mt-2 text-lg font-medium text-foreground">Customer push</p>
                    <p className="mt-1 text-sm text-(--ink-muted)">
                        Webhook relay: {source.webhook_mode === "disabled" ? "Disabled" : "Enabled"}
                    </p>
                </div>

                <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                    <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                        Status
                    </h3>
                    <div className="mt-2">
                        <ConnectionStatus
                            status={source.enabled ? "connected" : "not_configured"}
                        />
                    </div>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                {LINK_CARDS.map((card) => (
                    <Link
                        key={card.segment}
                        href={`${basePath}/${card.segment}`}
                        className="flex flex-col rounded-lg border border-(--border-subtle) bg-(--surface-base) p-6 shadow-sm transition-shadow hover:shadow-md"
                    >
                        <h3 className="text-base font-semibold text-(--ink-base)">{card.title}</h3>
                        <p className="mt-1.5 text-sm text-(--ink-muted)">{card.description}</p>
                    </Link>
                ))}
            </div>
        </div>
    );
}

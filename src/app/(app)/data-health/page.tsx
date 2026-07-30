import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";

export default function DataHealthOverviewPage() {
    return (
        <div className="space-y-8">
            <AdminHeader
                title="Data Health & Trust"
                description="Monitor connector freshness, identity coverage, and mapping health."
            />

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Link href="/data-health/connectors" className="block">
                    <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6 hover:border-(--accent) transition-colors h-full">
                        <h2 className="font-semibold text-lg mb-2">Connectors</h2>
                        <p className="text-sm text-(--ink-muted)">
                            Check synchronization freshness, errors, and status of all configured
                            providers.
                        </p>
                    </div>
                </Link>
                <Link href="/data-health/identity" className="block">
                    <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6 hover:border-(--accent) transition-colors h-full">
                        <h2 className="font-semibold text-lg mb-2">Identity Coverage</h2>
                        <p className="text-sm text-(--ink-muted)">
                            Review unmapped authors, missing identities, and alias suggestions.
                        </p>
                    </div>
                </Link>
                <Link href="/data-health/mapping" className="block">
                    <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6 hover:border-(--accent) transition-colors h-full">
                        <h2 className="font-semibold text-lg mb-2">Mapping Coverage</h2>
                        <p className="text-sm text-(--ink-muted)">
                            Review deployment to work-item mapping and overall traceability.
                        </p>
                    </div>
                </Link>
            </div>
        </div>
    );
}

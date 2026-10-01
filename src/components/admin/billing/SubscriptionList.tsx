"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
    getSubscriptions,
    type SubscriptionListResponse,
    type SubscriptionRecord,
} from "@/lib/billing/actions";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";

type SubscriptionListProps = {
    initialData: SubscriptionListResponse;
    initialOrgFilter?: string;
};

const STATUS_STYLES: Record<string, string> = {
    active: "bg-(--positive)/12 text-(--positive)",
    past_due: "bg-(--caution)/12 text-(--caution)",
    canceled: "bg-(--negative)/12 text-(--negative)",
    trialing: "bg-(--info)/12 text-(--info)",
    incomplete: "bg-(--card-stroke) text-(--ink-muted)",
};

function formatDate(value: string | null | undefined): string {
    if (!value) {
        return "-";
    }
    return new Date(value).toLocaleDateString();
}

function planLabel(subscription: SubscriptionRecord): string {
    const plan = subscription.plan;
    if (!plan || typeof plan !== "object") {
        return "-";
    }
    const name = plan.name;
    if (typeof name === "string" && name.length > 0) {
        return name;
    }
    const key = plan.key;
    if (typeof key === "string" && key.length > 0) {
        return key;
    }
    return "-";
}

export function SubscriptionList({ initialData, initialOrgFilter = "" }: SubscriptionListProps) {
    const [isPending, startTransition] = useTransition();
    const [orgFilter, setOrgFilter] = useState(initialOrgFilter);
    const [data, setData] = useState<SubscriptionListResponse>(initialData);

    const refreshList = (nextOffset = 0, nextOrgId = orgFilter) => {
        startTransition(async () => {
            const result = await getSubscriptions(
                data.limit,
                nextOffset,
                nextOrgId.trim() || undefined,
            );
            if (result.error) {
                toast.error(result.error);
                return;
            }
            if (result.data) {
                setData(result.data);
            }
        });
    };

    const columns = useMemo<DataTableColumn<SubscriptionRecord>[]>(
        () => [
            {
                key: "org",
                header: "Org",
                className: "px-4 py-3 text-xs text-(--ink-muted)",
                render: (subscription) => subscription.org_id,
            },
            {
                key: "status",
                header: "Status",
                className: "px-4 py-3",
                render: (subscription) => (
                    <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[subscription.status] ?? "bg-(--card-stroke) text-(--ink-muted)"}`}
                    >
                        {subscription.status}
                    </span>
                ),
            },
            {
                key: "plan",
                header: "Plan",
                className: "px-4 py-3 text-foreground",
                render: (subscription) => planLabel(subscription),
            },
            {
                key: "period",
                header: "Current Period",
                className: "px-4 py-3 text-(--ink-muted)",
                render: (subscription) => {
                    if (subscription.trial_start && subscription.trial_end) {
                        const dStart = new Date(subscription.trial_start);
                        const dEnd = new Date(subscription.trial_end);
                        const startStr = dStart.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                        });
                        const endStr = dEnd.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                        });
                        return `Trial: ${startStr} – ${endStr}`;
                    }
                    return `${formatDate(subscription.current_period_start)} - ${formatDate(subscription.current_period_end)}`;
                },
            },
            {
                key: "cancel",
                header: "Cancel At Period End",
                className: "px-4 py-3 text-(--ink-muted)",
                render: (subscription) => (subscription.cancel_at_period_end ? "Yes" : "No"),
            },
        ],
        [],
    );

    return (
        <DataTable
            accessibleLabel="Subscriptions"
            columns={columns}
            data={data.items}
            rowKeyAction={(subscription) => subscription.id}
            emptyMessage="No subscriptions found for this filter."
            search={{ value: orgFilter, placeholder: "Org ID", buttonLabel: "Filter" }}
            onSearchAction={() => refreshList(0, orgFilter)}
            onSearchChangeAction={setOrgFilter}
            pagination={{ limit: data.limit, offset: data.offset, total: data.total }}
            summaryLabel="subscriptions"
            onPageChangeAction={(nextOffset) => refreshList(nextOffset, orgFilter)}
            isPending={isPending}
        />
    );
}

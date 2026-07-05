"use client";

import type { SubscriptionHistoryItem } from "@/lib/billing/actions";
import { formatDate } from "./format";

type SubscriptionHistoryListProps = {
    history: SubscriptionHistoryItem[];
};

export function SubscriptionHistoryList({ history }: SubscriptionHistoryListProps) {
    return (
        <details className="mt-4 rounded-md border border-(--card-stroke) bg-(--background) p-4">
            <summary className="cursor-pointer text-sm font-semibold text-(--foreground)">
                Subscription History ({history.length})
            </summary>
            <ul className="mt-3 space-y-3">
                {history.map((item) => (
                    <li key={item.id} className="rounded-md border border-(--card-stroke) p-3">
                        <div className="flex items-center justify-between gap-4 text-sm">
                            <span className="font-medium text-(--foreground)">{item.event_type}</span>
                            <span className="text-(--ink-muted)">{formatDate(item.processed_at)}</span>
                        </div>
                        <p className="mt-1 text-xs text-(--ink-muted)">
                            {item.previous_status ?? "-"}
                            {" -> "}
                            {item.new_status}
                        </p>
                    </li>
                ))}
            </ul>
        </details>
    );
}

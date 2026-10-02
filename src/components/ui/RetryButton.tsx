"use client";

import { useRouter } from "next/navigation";

import { CTA_LABELS } from "@/lib/design/cta";

/**
 * Retry for a failed server fetch: re-runs the route's server render. A server page cannot hold a
 * click handler, so this small client button goes in the error state's `action` slot.
 */
export function RetryButton() {
    const router = useRouter();
    return (
        <button
            type="button"
            onClick={() => router.refresh()}
            className="rounded-xl border border-(--card-stroke) bg-background px-4 py-2 text-sm font-medium text-(--accent-2) hover:bg-(--card-80) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)/60"
        >
            {CTA_LABELS.retry}
        </button>
    );
}

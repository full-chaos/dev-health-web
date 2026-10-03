"use client";

import { useEffect } from "react";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { CTA_LABELS } from "@/lib/design/cta";
import { logger } from "@/lib/logger";

export default function SecurityError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        logger.error({ err: error, digest: error.digest }, "Security page error");
    }, [error]);

    return (
        <div className="flex items-center justify-center p-6">
            <ErrorCard
                title="Security page error"
                message="This page could not be shown."
                action={
                    <button
                        onClick={reset}
                        className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em] transition hover:bg-(--card-80)"
                    >
                        {CTA_LABELS.tryAgain}
                    </button>
                }
            />
        </div>
    );
}

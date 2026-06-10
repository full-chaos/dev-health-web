"use client";

import { ErrorView } from "@/components/shared/ErrorView";

export default function MarketingError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return <ErrorView error={error} reset={reset} />;
}

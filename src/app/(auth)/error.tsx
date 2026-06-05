"use client";

import { ErrorView } from "@/components/shared/ErrorView";

export default function AuthError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <ErrorView
            error={error}
            reset={reset}
            label="Authentication Error"
            description="An error occurred during authentication. Please try again."
        />
    );
}

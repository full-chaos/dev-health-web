"use client";

import { useEffect } from "react";

import { ErrorView } from "@/components/shared/ErrorView";
import { emitClientError } from "@/lib/telemetry/emitters";

export default function AppError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        emitClientError("route", error);
    }, [error]);
    return <ErrorView error={error} reset={reset} label="App Error" />;
}

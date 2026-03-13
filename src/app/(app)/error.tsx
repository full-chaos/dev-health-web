"use client";

import { ErrorView } from "@/components/shared/ErrorView";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorView error={error} reset={reset} label="App Error" />;
}

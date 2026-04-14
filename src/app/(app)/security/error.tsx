"use client";

import { ErrorCard } from "@/components/ui/ErrorCard";

export default function SecurityError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <ErrorCard
        title="Security page error"
        message={error.message}
        action={
          <button
            onClick={reset}
            className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em] transition hover:bg-(--card-80)"
          >
            Try again
          </button>
        }
      />
    </div>
  );
}

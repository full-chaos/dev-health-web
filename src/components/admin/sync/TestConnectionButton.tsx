"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { testConnection } from "@/lib/admin/server";

interface TestConnectionButtonProps {
  provider: string;
  credentialId: string | null;
}

export function TestConnectionButton({ provider, credentialId }: TestConnectionButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleTestConnection = () => {
    if (!credentialId) {
      return;
    }

    startTransition(async () => {
      const result = await testConnection(provider, { credentialId: credentialId });

      if (result.error || !result.data?.success) {
        toast.error(result.error || result.data?.error || "Connection test failed");
        return;
      }

      toast.success("Connection successful");
    });
  };

  return (
    <button
      type="button"
      onClick={handleTestConnection}
      disabled={isPending || !credentialId}
      className="inline-flex items-center gap-2 rounded-md border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-sm font-medium text-foreground hover:border-(--accent) hover:text-(--accent) disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {isPending ? "Testing..." : "Test Connection"}
    </button>
  );
}

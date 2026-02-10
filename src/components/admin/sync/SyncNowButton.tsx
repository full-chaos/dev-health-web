"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { triggerSync } from "@/lib/admin/server";

interface SyncNowButtonProps {
  configId: string;
  className?: string;
}

export function SyncNowButton({ configId, className }: SyncNowButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleTrigger = () => {
    startTransition(async () => {
      try {
        const result = await triggerSync(configId);
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success("Sync triggered successfully");
          router.refresh();
        }
      } catch {
        toast.error("Failed to trigger sync");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleTrigger}
      disabled={isPending}
      className={
        className ??
        "cursor-pointer rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:opacity-80 active:opacity-70 disabled:opacity-50 transition-opacity"
      }
    >
      {isPending ? "Syncing…" : "Sync Now"}
    </button>
  );
}

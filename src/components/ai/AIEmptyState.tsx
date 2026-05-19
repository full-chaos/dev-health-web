import type { ReactNode } from "react";

export function AIEmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-80) p-6 text-sm text-(--ink-muted)">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-2">
        {children ?? "Connect a GitHub provider to populate AI-assisted PR attribution and workflow evidence."}
      </p>
    </div>
  );
}

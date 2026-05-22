import Link from "next/link";
import type { ReactNode } from "react";

type AIPanelCardProps = {
  title: string;
  description: string;
  evidenceHref?: string;
  children: ReactNode;
};

export function AIPanelCard({ title, description, evidenceHref, children }: AIPanelCardProps) {
  return (
    <section
      className="rounded-3xl border border-(--card-stroke) bg-card p-5 shadow-sm"
      data-testid={`ai-panel-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-(--font-display) text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-(--ink-muted)">{description}</p>
        </div>
        {evidenceHref && (
          <Link
            className="shrink-0 text-xs font-medium text-foreground underline-offset-4 hover:underline"
            href={evidenceHref}
          >
            View evidence
          </Link>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

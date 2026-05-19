import type { ReactNode } from "react";

type AIPageHeaderProps = {
  eyebrow: string;
  title: string;
  children: ReactNode;
};

/**
 * Shared page header for the three top-level AI workflow views
 * (Impact, Review Load, Risk). Keeps eyebrow + title + lede consistent
 * across the cluster so copy tone doesn't drift between pages.
 */
export function AIPageHeader({ eyebrow, title, children }: AIPageHeaderProps) {
  return (
    <header>
      <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">{eyebrow}</p>
      <h1 className="mt-2 font-(--font-display) text-3xl">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm text-(--ink-muted)">{children}</p>
    </header>
  );
}

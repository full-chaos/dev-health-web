import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "@/components/Breadcrumbs";
import { PreviewBadge } from "@/components/PreviewBadge";

type AIPageHeaderProps = {
  eyebrow: string;
  title: string;
  children: ReactNode;
  /** Location trail (section → page → tab). Rendered above the eyebrow. */
  breadcrumbs?: Crumb[];
  /** When true, marks the page as a preview surface next to the title. */
  preview?: boolean;
};

/**
 * Shared page header for the three top-level AI workflow views
 * (Impact, Review Load, Risk). Keeps eyebrow + title + lede consistent
 * across the cluster so copy tone doesn't drift between pages.
 */
export function AIPageHeader({
  eyebrow,
  title,
  children,
  breadcrumbs,
  preview,
}: AIPageHeaderProps) {
  return (
    <header>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <div className="mb-3">
          <Breadcrumbs items={breadcrumbs} />
        </div>
      ) : null}
      <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">{eyebrow}</p>
      <div className="mt-2 flex items-center gap-3">
        <h1 className="font-(--font-display) text-3xl">{title}</h1>
        {preview ? <PreviewBadge title="This feature is in preview." /> : null}
      </div>
      <p className="mt-2 max-w-3xl text-sm text-(--ink-muted)">{children}</p>
    </header>
  );
}

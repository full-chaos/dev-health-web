import Link from "next/link";
import { Fragment } from "react";

export type Crumb = {
  label: string;
  /** Omit `href` for the current page (rendered as plain, non-link text). */
  href?: string;
};

/**
 * Reusable location trail (section → page → tab) so users always know where
 * they are inside the authenticated app. Shared across (app) routes via the
 * page-header components (AIPageHeader, AdminHeader) rather than re-invented
 * per page.
 *
 * Rendering rules:
 * - The last crumb is the current page: rendered as text with aria-current.
 * - Earlier crumbs with an `href` are links; without one they are plain text.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" data-testid="breadcrumbs">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-(--ink-muted)">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={`${item.label}-${index}`}>
              <li className="flex items-center">
                {item.href && !isLast ? (
                  <Link href={item.href} className="transition-colors hover:text-foreground">
                    {item.label}
                  </Link>
                ) : (
                  <span
                    className={isLast ? "font-medium text-foreground" : undefined}
                    aria-current={isLast ? "page" : undefined}
                  >
                    {item.label}
                  </span>
                )}
              </li>
              {!isLast && (
                <li aria-hidden="true" className="select-none text-(--ink-muted)/60">
                  /
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

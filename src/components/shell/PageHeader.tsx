"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { BackLink } from "@/components/shared/BackLink";
import { navTitleForPathname, navTrailForPathname } from "@/lib/navigation/areas";
import { backLinkAllowed } from "@/lib/navigation/backLink";

type PageHeaderProps = {
    /**
     * The page title, rendered as the page's one `h1`. Defaults to the nav
     * config's title for the route (A6: sidebar label = page title = breadcrumb).
     * Pass it for a page the nav config does not name (a detail page).
     */
    title?: string;
    /**
     * A small mark beside the title, in the same row (a pill such as "Platform admin" or
     * "Preview"). It sits next to the `h1`, never inside it, so the page's one heading stays the
     * title alone. Omitted: nothing is drawn.
     */
    titleAdornment?: ReactNode;
    /** One line under the title. */
    subtitle?: ReactNode;
    /** Right-aligned page actions (buttons from the CTA registry). */
    actions?: ReactNode;
    /**
     * Return path for a detail page: back to the parent list with its state. It
     * is not rendered when its target equals the last breadcrumb link (A5).
     */
    back?: { href: string; area?: string };
    /**
     * The current-page crumb for a page the nav config does not name (a metric evidence page:
     * "Blocked Work evidence"). It goes after the area in the eyebrow.
     */
    trailLeaf?: string;
    /** Meta row under the subtitle (freshness, badges). */
    children?: ReactNode;
};

/**
 * The shared page header (Part E): eyebrow, title, subtitle and an actions slot.
 *
 * The eyebrow is the navigation trail ("AREA / DESTINATION"), read from the nav
 * config, so it cannot drift from the sidebar and the breadcrumbs. It is left
 * out when it would only repeat the title (A8).
 */
export function PageHeader({
    title,
    titleAdornment,
    subtitle,
    actions,
    back,
    trailLeaf,
    children,
}: PageHeaderProps) {
    const pathname = usePathname() ?? "";
    const heading = title ?? navTitleForPathname(pathname);
    const trail = navTrailForPathname(pathname, trailLeaf)
        .map((crumb) => crumb.label)
        .join(" / ");
    const eyebrow = trail.toLowerCase() === heading.toLowerCase() ? "" : trail;
    const showBack = back !== undefined && backLinkAllowed(pathname, back.href);

    return (
        <header data-testid="page-header" className="flex flex-col gap-3">
            {showBack ? (
                back.area ? (
                    <BackLink href={back.href} area={back.area} />
                ) : (
                    <BackLink href={back.href} />
                )
            ) : null}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    {eyebrow ? (
                        <p
                            data-testid="page-header-eyebrow"
                            className="mb-2 text-label-caps font-semibold uppercase text-(--text-muted)"
                        >
                            {eyebrow}
                        </p>
                    ) : null}
                    {titleAdornment ? (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <h1 className="text-h1 text-(--text-primary)">{heading}</h1>
                            <div data-testid="page-header-title-adornment">{titleAdornment}</div>
                        </div>
                    ) : (
                        <h1 className="text-h1 text-(--text-primary)">{heading}</h1>
                    )}
                    {subtitle ? (
                        <p className="mt-2 max-w-3xl text-body text-(--text-secondary)">
                            {subtitle}
                        </p>
                    ) : null}
                </div>
                {actions ? (
                    <div
                        data-testid="page-header-actions"
                        className="flex shrink-0 flex-wrap items-center gap-2"
                    >
                        {actions}
                    </div>
                ) : null}
            </div>
            {children ? <div className="flex flex-col gap-3">{children}</div> : null}
        </header>
    );
}

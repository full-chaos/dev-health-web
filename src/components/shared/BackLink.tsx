import Link from "next/link";

import { CTA_LABELS, backToArea } from "@/lib/design/cta";

type BackLinkBaseProps = {
    href: string;
    className?: string;
};

type BackLinkProps = BackLinkBaseProps &
    (
        | {
              /** Explicit label (must originate from the CTA registry). */ label: string;
              area?: never;
          }
        | {
              /** Named decision area → renders `Back to {area}`. */ area: string;
              label?: never;
          }
        | { label?: never; area?: never }
    );

/**
 * Return-path link primitive (framework A5).
 *
 * Renders the single, consistent "way back" for a screen. It is deliberately
 * styled as a quiet inline link with a leading arrow — NOT a rounded filter
 * pill and NOT a primary button — so a return path is never confused with a
 * filter toggle ({@link FilterPills}) or a route tab ({@link ModeTabs}).
 *
 * Labels come from the CTA registry: defaults to `Back to Cockpit`, or pass
 * `area` to render the canonical `Back to {area}` form.
 */
export function BackLink({ href, label, area, className }: BackLinkProps) {
    const text = label ?? (area ? backToArea(area) : CTA_LABELS.backToCockpit);

    return (
        <Link
            href={href}
            className={`group inline-flex items-center gap-1.5 text-label-caps uppercase text-(--text-muted) transition-colors hover:text-(--text-primary) ${className ?? ""}`.trim()}
        >
            <span aria-hidden="true" className="transition-transform group-hover:-translate-x-0.5">
                &larr;
            </span>
            {text}
        </Link>
    );
}

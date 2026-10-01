"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import type { CompoundingRiskScope } from "./CompoundingRiskDashboard";

const OPTIONS: Array<{ value: CompoundingRiskScope; label: string }> = [
    { value: "repo", label: "By repo" },
    { value: "team", label: "By team" },
];

/**
 * "By repo / By team" segment for the existing `breakout` URL param. Each
 * option is a link to the same page with every other param kept (`f`, `role`,
 * `origin`); only `breakout` changes. There is no person option: this surface
 * is a team and repo signal.
 */
export function BreakoutSegment({ breakout }: { breakout: CompoundingRiskScope }) {
    const pathname = usePathname() ?? "/risk/compounding";
    const searchParams = useSearchParams();

    const hrefFor = (value: CompoundingRiskScope) => {
        const next = new URLSearchParams(searchParams?.toString() ?? "");
        next.set("breakout", value);
        return `${pathname}?${next.toString()}`;
    };

    return (
        <nav
            aria-label="Breakout"
            data-testid="breakout-segment"
            className="flex rounded-(--radius-pill) border border-(--border) bg-(--surface-raised) p-1 text-xs"
        >
            {OPTIONS.map((option) => {
                const active = option.value === breakout;
                return (
                    <Link
                        key={option.value}
                        href={hrefFor(option.value)}
                        aria-current={active ? "page" : undefined}
                        className={`rounded-(--radius-pill) px-3 py-1 font-semibold ${
                            active
                                ? "bg-(--accent) text-(--accent-foreground)"
                                : "text-(--text-secondary) hover:text-(--text-primary)"
                        }`}
                    >
                        {option.label}
                    </Link>
                );
            })}
        </nav>
    );
}

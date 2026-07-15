"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BetaBadge } from "@/components/BetaBadge";
import { OrgSwitcher } from "@/components/navigation/OrgSwitcher";

import { withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";
import {
    navAreas,
    selectedAreaIdForPathname,
    selectedChildForPathname,
    type NavArea,
    type NavChildRoute,
} from "@/lib/navigation/areas";

// ── Component ────────────────────────────────────────────────────────────────
//
// Two-level sidebar (Framework A1, CHAOS-2075): the eight decision areas are
// always shown; the ACTIVE main-placement area expands to its child
// *destinations* as an indented list, while inactive areas stay collapsed.
// Utility-placement areas (Reports, Admin) render as plain rows with NO child
// expansion even when active (owner directive). Tab subviews live on the
// destination page (Framework A2), never here. The nav config is the single
// source of truth (`@/lib/navigation/areas`); `children` is the sidebar route
// tree, distinct from `hubItems` (the landing triage cards).

type PrimaryNavProps = {
    filters: MetricFilter;
    active?: string;
    role?: string;
};

export function PrimaryNav({ filters, active, role }: PrimaryNavProps) {
    const pathname = usePathname();
    const selectedAreaId = selectedAreaIdForPathname(navAreas, pathname, active);

    const mainAreas = navAreas.filter((area) => area.placement === "main");
    const utilityAreas = navAreas.filter((area) => area.placement === "utility");

    const renderChild = (child: NavChildRoute, activeChildId: string | undefined) => {
        const isActive = child.id === activeChildId;
        return (
            <Link
                key={child.id}
                href={withFilterParam(child.path, filters, role)}
                aria-current={isActive ? "page" : undefined}
                className={`group relative flex items-center rounded-xl px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/35 ${
                    isActive
                        ? "bg-(--accent)/12 font-medium text-foreground before:absolute before:left-0 before:top-1/4 before:h-1/2 before:w-0.5 before:rounded-full before:bg-(--accent)"
                        : `border border-transparent ${
                              child.demoted ? "text-(--ink-muted)/70" : "text-(--ink-muted)"
                          } hover:border-(--card-stroke) hover:bg-(--card-80) hover:text-foreground focus-visible:border-(--card-stroke) focus-visible:bg-(--card-80) focus-visible:text-foreground`
                }`}
            >
                <span>{child.label}</span>
            </Link>
        );
    };

    const renderArea = (area: NavArea) => {
        const isActive = selectedAreaId === area.id;
        // Only main-placement areas expand; utility areas (Reports, Admin) render as
        // plain rows with no child expansion even when active (owner directive).
        // Within main areas, only the active area expands; inactive stay collapsed.
        // Only navVisible children are rendered (no preview rows, no tab subviews).
        // Exactly one row is highlighted.
        const visibleChildren =
            isActive && area.placement === "main"
                ? area.children.filter((child) => child.navVisible)
                : [];
        const activeChild = isActive ? selectedChildForPathname(area, pathname) : undefined;
        const areaRowIsSelected = isActive && (area.placement === "utility" || !activeChild);
        const activeChildId = activeChild?.id;

        return (
            <div key={area.id}>
                <Link
                    href={withFilterParam(area.href, filters, role)}
                    aria-current={areaRowIsSelected ? "page" : undefined}
                    // Stable hook for "which area is selected" assertions: marks the active
                    // area row whether the selection is the area landing (aria-current here)
                    // or a child leaf (aria-current on the child). Keeps aria-current a11y-
                    // correct (the link to the current page) per PrimaryNav.test.tsx / A10.
                    data-active={isActive ? "true" : undefined}
                    className={`group relative flex items-center rounded-2xl border px-3 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/35 ${
                        isActive
                            ? "border-(--accent) bg-(--accent)/15 text-foreground before:absolute before:left-0 before:top-1/4 before:h-1/2 before:w-[3px] before:rounded-full before:bg-(--accent)"
                            : "border-transparent bg-(--card-70) text-(--ink-muted) hover:border-(--card-stroke) hover:bg-(--card-80) hover:text-foreground focus-visible:border-(--card-stroke) focus-visible:bg-(--card-80) focus-visible:text-foreground"
                    }`}
                >
                    <span className="font-medium">{area.label}</span>
                </Link>

                {visibleChildren.length > 0 ? (
                    // C3 4px scale: indent via a hairline rail (--card-stroke), no bright
                    // borders. The active area owns one expanded list; A10 keeps exactly
                    // one child selected with hover/focus visually distinct.
                    <div
                        className="mt-1 ml-3 flex flex-col gap-0.5 border-l border-(--card-stroke) pl-2"
                        data-testid={`nav-children-${area.id}`}
                    >
                        {visibleChildren.map((child) => renderChild(child, activeChildId))}
                    </div>
                ) : null}
            </div>
        );
    };

    return (
        <aside className="w-full md:max-w-56 md:shrink-0">
            <div className="md:sticky md:top-6">
                <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl border border-(--card-stroke) bg-(--card-80) p-4 md:max-h-none md:overflow-visible">
                    <div>
                        <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                            Full Chaos Dev Health Ops
                        </p>
                        <p className="mt-2 font-(--font-display) text-lg font-semibold flex items-center gap-2">
                            Cockpit <BetaBadge />
                        </p>
                        <p className="mt-1 text-xs text-(--ink-muted)">
                            Observe patterns, drill into evidence.
                        </p>
                    </div>

                    <OrgSwitcher />

                    {/* Main spine — decision areas (A1). The active area expands to its
              child destinations below its row; tab subviews stay on the page (A2). */}
                    <nav className="mt-4 space-y-2 text-sm" aria-label="Primary areas">
                        {mainAreas.map((area) => renderArea(area))}
                    </nav>

                    {/* Utility tray — visually separated from main spine */}
                    <div className="mt-4 border-t border-(--card-stroke) pt-3 space-y-2 text-xs">
                        {utilityAreas.map((area) => renderArea(area))}
                    </div>

                    <div className="mt-4 rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-3 py-2 text-xs text-(--ink-muted)">
                        The active area expands to its destinations; open one to drill in.
                    </div>
                </div>
            </div>
        </aside>
    );
}

"use client";

import {
    Activity,
    CalendarDays,
    ChevronDown,
    ChevronRight,
    FileText,
    House,
    type LucideIcon,
    Settings,
    ShieldCheck,
    Sparkles,
    TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAdminNav } from "@/components/admin/AdminTabs";
import { useAdminTier } from "@/components/admin/AdminTierContext";
import {
    isNavChildVisible,
    navAreas,
    selectedAreaIdForPathname,
    selectedChildForPathname,
    type NavArea,
    type NavChildRoute,
} from "@/lib/navigation/areas";

import { shellHref } from "./shellHref";
import { useShellNavParams } from "./useShellNavParams";

// Sidebar navigation of the shared app shell (Framework A1). The decision areas
// come from the nav config (`navAreas`); the ACTIVE area expands to its child
// destinations and the others stay collapsed. A utility area (Reports, Admin)
// expands only when it has more than one destination: Admin shows its four
// (AD-1 option A); Reports' one child would only repeat the area row. Exactly
// one row is the current page (A10): the accent marks it, and hover / focus use
// a different treatment.

/**
 * One icon per area, as the prototype draws them (`app.js` ICONS: home, diagnose,
 * plan, improve, govern, report, settings). The prototype has no AI area; Sparkles
 * stands in for it.
 */
export const AREA_ICONS: Record<NavArea["id"], LucideIcon> = {
    cockpit: House,
    diagnose: Activity,
    plan: CalendarDays,
    improve: TrendingUp,
    govern: ShieldCheck,
    ai: Sparkles,
    reports: FileText,
    admin: Settings,
};

const ROW_FOCUS =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)/60";
const ROW_SELECTED =
    "bg-(--surface2) font-semibold text-(--text-primary) before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-(--radius-pill) before:bg-(image:--ember-vertical)";
const ROW_IDLE = "hover:bg-(--surface2)/60 hover:text-(--text-primary)";

type ShellNavProps = {
    /** The navigation registry. Defaults to the app's `navAreas`. */
    areas?: readonly NavArea[];
    /**
     * Which block to draw. The sidebar draws "main" inside its scroll region and
     * "utility" (Reports, Admin) below it, held at the bottom above the account
     * block. "all" draws both (default).
     */
    part?: "all" | "main" | "utility";
};

export function ShellNav({ areas = navAreas, part = "all" }: ShellNavProps) {
    const pathname = usePathname() ?? "";
    const params = useShellNavParams(pathname);
    const { features } = useAdminTier();
    // The platform admin rows (CHAOS-7967) are listed only for a platform admin.
    const { isPlatformAdmin } = useAdminNav();
    const selectedAreaId = selectedAreaIdForPathname(areas, pathname);

    const mainAreas = areas.filter((area) => area.placement === "main");
    const utilityAreas = areas.filter((area) => area.placement === "utility");

    const renderChild = (child: NavChildRoute, activeChildId: string | undefined) => {
        const isActive = child.id === activeChildId;
        const idleInk = child.demoted ? "text-(--text-muted)" : "text-(--text-secondary)";
        return (
            <Link
                key={child.id}
                href={shellHref(child.path, params)}
                aria-current={isActive ? "page" : undefined}
                className={`relative flex min-h-9 items-center rounded-(--radius-sm) px-2.5 py-1.5 text-[0.8125rem] transition ${ROW_FOCUS} ${
                    isActive ? ROW_SELECTED : `${idleInk} ${ROW_IDLE}`
                }`}
            >
                {child.label}
            </Link>
        );
    };

    const renderArea = (area: NavArea) => {
        const isActive = selectedAreaId === area.id;
        const listedChildren = isActive
            ? area.children.filter((child) =>
                  isNavChildVisible(child, features, { isPlatformAdmin }),
              )
            : [];
        const visibleChildren =
            area.placement === "main" || listedChildren.length > 1 ? listedChildren : [];
        const selectedChild = isActive ? selectedChildForPathname(area, pathname) : undefined;
        const activeChild = visibleChildren.find((child) => child.id === selectedChild?.id);
        const areaRowIsSelected = isActive && !activeChild;
        // A chevron marks an area that has destinations: down while expanded, right
        // while collapsed (the prototype's ⌄ / ›). Utility areas follow the rule that
        // lists their children (more than one).
        const hasChildren =
            area.children.filter((child) => isNavChildVisible(child, features, { isPlatformAdmin }))
                .length > (area.placement === "main" ? 0 : 1);
        const AreaIcon = AREA_ICONS[area.id];
        const Chevron = isActive ? ChevronDown : ChevronRight;
        // The active area keeps primary ink when one of its children is the page.
        const idleInk = isActive ? "text-(--text-primary)" : "text-(--text-secondary)";

        return (
            <div key={area.id}>
                <Link
                    href={shellHref(area.href, params)}
                    aria-current={areaRowIsSelected ? "page" : undefined}
                    data-active={isActive ? "true" : undefined}
                    className={`relative flex min-h-10 items-center gap-3 rounded-(--radius-sm) px-3 py-2 text-sm font-medium transition ${ROW_FOCUS} ${
                        areaRowIsSelected ? ROW_SELECTED : `${idleInk} ${ROW_IDLE}`
                    }`}
                >
                    <AreaIcon aria-hidden="true" strokeWidth={1.65} className="size-4.5 shrink-0" />
                    {area.label}
                    {hasChildren ? (
                        <Chevron
                            aria-hidden="true"
                            data-testid={`nav-chevron-${area.id}`}
                            className="ml-auto size-3.5 shrink-0 opacity-60"
                        />
                    ) : null}
                </Link>

                {visibleChildren.length > 0 ? (
                    <div
                        className="mb-2 ml-5 mt-1 flex flex-col gap-0.5 border-l border-(--card-stroke) pl-2.5"
                        data-testid={`nav-children-${area.id}`}
                    >
                        {visibleChildren.map((child) => renderChild(child, activeChild?.id))}
                    </div>
                ) : null}
            </div>
        );
    };

    return (
        <>
            {part !== "utility" && (
                <nav aria-label="Primary areas" className="flex flex-col gap-1">
                    {mainAreas.map((area) => renderArea(area))}
                </nav>
            )}
            {part !== "main" && (
                <nav
                    aria-label="Reports and admin"
                    className={`flex flex-col gap-1 border-t border-(--border) pt-3 ${
                        part === "all" ? "mt-3" : ""
                    }`}
                >
                    {utilityAreas.map((area) => renderArea(area))}
                </nav>
            )}
        </>
    );
}

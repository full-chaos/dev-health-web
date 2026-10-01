"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
// come from the nav config (`navAreas`); the ACTIVE main area expands to its
// child destinations, the others stay collapsed, and the utility areas (Reports,
// Admin) never expand. Exactly one row is the current page (A10): the accent
// marks it, and hover / focus use a different treatment.

const ROW_FOCUS =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)/60";
const ROW_SELECTED =
    "bg-(--surface-raised) font-semibold text-(--text-primary) before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-(--radius-pill) before:bg-(--accent)";
const ROW_IDLE = "hover:bg-(--surface-raised)/60 hover:text-(--text-primary)";

type ShellNavProps = {
    /** The navigation registry. Defaults to the app's `navAreas`. */
    areas?: readonly NavArea[];
};

export function ShellNav({ areas = navAreas }: ShellNavProps) {
    const pathname = usePathname() ?? "";
    const params = useShellNavParams(pathname);
    const { features } = useAdminTier();
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
                className={`relative flex items-center rounded-(--radius-sm) px-3 py-1.5 text-sm transition ${ROW_FOCUS} ${
                    isActive ? ROW_SELECTED : `${idleInk} ${ROW_IDLE}`
                }`}
            >
                {child.label}
            </Link>
        );
    };

    const renderArea = (area: NavArea) => {
        const isActive = selectedAreaId === area.id;
        const visibleChildren =
            isActive && area.placement === "main"
                ? area.children.filter((child) => isNavChildVisible(child, features))
                : [];
        const selectedChild = isActive ? selectedChildForPathname(area, pathname) : undefined;
        const activeChild = visibleChildren.find((child) => child.id === selectedChild?.id);
        const areaRowIsSelected = isActive && (area.placement === "utility" || !activeChild);
        // The active area keeps primary ink when one of its children is the page.
        const idleInk = isActive ? "text-(--text-primary)" : "text-(--text-secondary)";

        return (
            <div key={area.id}>
                <Link
                    href={shellHref(area.href, params)}
                    aria-current={areaRowIsSelected ? "page" : undefined}
                    data-active={isActive ? "true" : undefined}
                    className={`relative flex min-h-10 items-center rounded-(--radius-sm) px-3 py-2 text-sm font-medium transition ${ROW_FOCUS} ${
                        areaRowIsSelected ? ROW_SELECTED : `${idleInk} ${ROW_IDLE}`
                    }`}
                >
                    {area.label}
                </Link>

                {visibleChildren.length > 0 ? (
                    <div
                        className="mb-2 ml-4 mt-1 flex flex-col gap-0.5 border-l border-(--border) pl-2"
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
            <nav aria-label="Primary areas" className="flex flex-col gap-1">
                {mainAreas.map((area) => renderArea(area))}
            </nav>
            <nav
                aria-label="Reports and admin"
                className="mt-3 flex flex-col gap-1 border-t border-(--border) pt-3"
            >
                {utilityAreas.map((area) => renderArea(area))}
            </nav>
        </>
    );
}

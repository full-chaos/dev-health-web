"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";

import { useAdminTier } from "@/components/admin/AdminTierContext";
import { ViewSet, type ViewSetItem } from "@/components/navigation/ViewSet";
import { getAreaById } from "@/lib/navigation/areas";
import { isTabVisible, routeTabForPathname, tabHref } from "@/lib/navigation/tabs";

type AdminNav = {
    /** A platform admin (superuser): the old admin sidebar showed the Platform Admin entry. */
    isPlatformAdmin: boolean;
};

const AdminNavContext = createContext<AdminNav>({ isPlatformAdmin: false });

/** Set by the org admin layout, which reads the session on the server. */
export function AdminNavProvider({
    isPlatformAdmin,
    children,
}: AdminNav & { children: ReactNode }) {
    return (
        <AdminNavContext.Provider value={{ isPlatformAdmin }}>{children}</AdminNavContext.Provider>
    );
}

export function useAdminNav(): AdminNav {
    return useContext(AdminNavContext);
}

/** The Organization tab that the old admin sidebar hid from platform admins ("Organization"). */
const HIDDEN_FOR_PLATFORM_ADMIN = { set: "admin-organization", tab: "settings" } as const;

/**
 * The tab row of an Admin destination (AD-1 option A): the pages of the old admin sidebar, as
 * route tabs of Organization or Connections (`lib/navigation/tabs.ts`). A tab that needs a feature
 * the organization lacks is not shown, as in the old sidebar. Platform admins get the link
 * "Platform Admin" at the end of the Organization row. Renders nothing outside the Admin tabs.
 */
export function AdminTabs() {
    const pathname = usePathname() ?? "";
    const { features } = useAdminTier();
    const { isPlatformAdmin } = useAdminNav();

    const found = routeTabForPathname(pathname);
    if (!found || found.set.areaId !== "admin") return null;
    const { set, tab: active } = found;

    const destination = getAreaById("admin")?.children.find(
        (child) => child.path === (set.childPath ?? set.basePath),
    );
    const items: ViewSetItem[] = set.tabs
        .filter((tab) => isTabVisible(tab, features))
        .filter(
            (tab) =>
                !(
                    isPlatformAdmin &&
                    set.id === HIDDEN_FOR_PLATFORM_ADMIN.set &&
                    tab.id === HIDDEN_FOR_PLATFORM_ADMIN.tab
                ),
        )
        .map((tab) => ({
            id: tab.id,
            label: tab.label,
            path: tabHref(set, tab.id),
            navVisible: true,
        }));

    return (
        <div data-testid="admin-tabs" className="flex items-end gap-2">
            <ViewSet
                orientation="tabs"
                items={items}
                activeId={active.id}
                ariaLabel={`${destination?.label ?? "Admin"} views`}
                className="min-w-0 flex-1"
            />
            {isPlatformAdmin && set.id === "admin-organization" ? (
                <Link
                    href="/superadmin"
                    prefetch={false}
                    className="shrink-0 px-3.5 py-3 text-label-caps uppercase text-(--ink-muted) hover:text-foreground"
                >
                    Platform Admin
                </Link>
            ) : null}
        </div>
    );
}

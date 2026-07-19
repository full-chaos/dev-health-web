"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { OrgSwitcher } from "@/components/navigation/OrgSwitcher";

type NavItem = {
    id: string;
    label: string;
    href: string;
    description: string;
    featureKey?: string;
};

const navItems: NavItem[] = [
    {
        id: "dashboard",
        label: "Dashboard",
        href: "/org/admin",
        description: "Overview",
    },
    {
        id: "users",
        label: "Users",
        href: "/org/admin/users",
        description: "Org members",
    },
    {
        id: "organization",
        label: "Organization",
        href: "/org/admin/settings",
        description: "Workspace settings",
    },
    {
        id: "integrations",
        label: "Providers",
        href: "/org/admin/integrations",
        description: "Connected sources",
    },
    {
        id: "sync",
        label: "Sync Status",
        href: "/org/admin/sync",
        description: "Sync activity",
    },
    {
        id: "teams",
        label: "Teams",
        href: "/org/admin/teams",
        description: "Team ownership",
    },
    {
        id: "identities",
        label: "Identities",
        href: "/org/admin/identities",
        description: "Identity mapping",
    },
    {
        id: "audit",
        label: "Audit Logs",
        href: "/org/admin/audit-logs",
        description: "Access history",
        featureKey: "audit_log",
    },
    {
        id: "ip-allowlist",
        label: "IP Allowlist",
        href: "/org/admin/ip-allowlist",
        description: "Network access",
        featureKey: "ip_allowlist",
    },
    {
        id: "retention",
        label: "Data Retention",
        href: "/org/admin/retention",
        description: "Retention policy",
        featureKey: "custom_retention",
    },
    {
        id: "byo-llm",
        label: "AI Setup",
        href: "/org/admin/ai",
        description: "Model provider",
        featureKey: "byo_llm",
    },
];

type AdminSidebarProps = {
    isSuperuser?: boolean;
    features?: Record<string, boolean>;
};

function isNavItemActive(pathname: string, item: NavItem): boolean {
    if (item.href === "/org/admin") {
        return pathname === item.href;
    }
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AdminSidebar({ isSuperuser, features }: AdminSidebarProps) {
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);
    const mobileNavControlRef = useRef<HTMLButtonElement>(null);

    const filteredNavItems = navItems.filter((item) => {
        if (isSuperuser && item.id === "organization") {
            return false;
        }
        if (item.featureKey && features?.[item.featureKey] !== true) {
            return false;
        }
        return true;
    });

    const closeMobileNavigation = () => {
        setMobileOpen(false);
        mobileNavControlRef.current?.focus();
    };

    return (
        <aside
            className="w-full md:max-w-56 md:shrink-0"
            onKeyDown={(event) => {
                if (event.key === "Escape" && mobileOpen) {
                    event.preventDefault();
                    closeMobileNavigation();
                }
            }}
        >
            <button
                type="button"
                ref={mobileNavControlRef}
                aria-controls="admin-navigation-panel"
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen((open) => !open)}
                className="w-full rounded-(--radius-sm) border border-(--card-stroke) bg-(--card-80) px-4 py-3 text-left text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50 md:hidden"
            >
                {mobileOpen ? "Hide admin navigation" : "Show admin navigation"}
            </button>
            <div className="md:sticky md:top-6">
                <div
                    id="admin-navigation-panel"
                    data-testid="admin-navigation-panel"
                    className={`${mobileOpen ? "mt-3 block" : "hidden"} max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5 md:mt-0 md:block md:max-h-none md:overflow-visible`}
                >
                    <div>
                        <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                            Full Chaos Dev Health Ops
                        </p>
                        <p className="mt-3 font-(--font-display) text-lg">Admin</p>
                        {isSuperuser && (
                            <span className="mt-1 inline-flex items-center rounded-full bg-purple-500/10 px-2 py-0.5 text-label-caps font-medium uppercase text-purple-500">
                                Platform Admin
                            </span>
                        )}
                        <p className="mt-2 text-xs text-(--ink-muted)">
                            System configuration and management.
                        </p>
                    </div>

                    <OrgSwitcher />
                    <nav className="mt-5 space-y-2 text-sm" aria-label="Admin navigation">
                        {filteredNavItems.map((item) => {
                            const isActive = isNavItemActive(pathname, item);
                            return (
                                <Link
                                    key={item.id}
                                    href={item.href}
                                    aria-current={isActive ? "page" : undefined}
                                    className={`group flex items-center justify-between rounded-2xl border px-3 py-2 transition ${
                                        isActive
                                            ? "border-(--accent) bg-(--accent)/15 text-foreground"
                                            : "border-transparent bg-(--card-70) text-(--ink-muted) hover:border-(--card-stroke) hover:text-foreground"
                                    }`}
                                >
                                    <span className="font-medium">{item.label}</span>
                                    <span
                                        className={`text-label-caps uppercase ${
                                            isActive ? "text-(--accent)" : "text-(--ink-muted)"
                                        }`}
                                    >
                                        {item.description}
                                    </span>
                                </Link>
                            );
                        })}
                        {isSuperuser && (
                            <Link
                                href="/superadmin"
                                className="group flex items-center justify-between rounded-2xl border border-purple-500/20 bg-purple-500/10 px-3 py-2 text-purple-400 hover:bg-purple-500/20 transition"
                            >
                                <span className="font-medium">Platform Admin</span>
                                <span className="text-label-caps uppercase">Global</span>
                            </Link>
                        )}
                    </nav>
                    <div className="mt-5 rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-3 py-3 text-xs text-(--ink-muted)">
                        Return to{" "}
                        <Link href="/dashboard" className="underline hover:text-foreground">
                            main app
                        </Link>
                        .
                    </div>
                </div>
            </div>
        </aside>
    );
}

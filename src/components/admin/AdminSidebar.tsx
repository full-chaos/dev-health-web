"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
        description: "Management",
    },
    {
        id: "organization",
        label: "Organization",
        href: "/org/admin/settings",
        description: "Settings",
    },
    {
        id: "integrations",
        label: "Integrations",
        href: "/org/admin/integrations",
        description: "Connectors",
    },
    {
        id: "sync",
        label: "Sync Status",
        href: "/org/admin/sync",
        description: "Jobs",
    },
    {
        id: "teams",
        label: "Teams",
        href: "/org/admin/teams",
        description: "Identity",
    },
    {
        id: "identities",
        label: "Identities",
        href: "/org/admin/identities",
        description: "Mapping",
    },
    {
        id: "audit",
        label: "Audit Logs",
        href: "/org/admin/audit-logs",
        description: "Enterprise",
        featureKey: "audit_log",
    },
    {
        id: "ip-allowlist",
        label: "IP Allowlist",
        href: "/org/admin/ip-allowlist",
        description: "Security",
        featureKey: "ip_allowlist",
    },
    {
        id: "retention",
        label: "Retention",
        href: "/org/admin/retention",
        description: "Compliance",
        featureKey: "custom_retention",
    },
    {
        id: "byo-llm",
        label: "AI Setup",
        href: "/org/admin/ai",
        description: "LLM",
        featureKey: "byo_llm",
    },
];

type AdminSidebarProps = {
    isSuperuser?: boolean;
    features?: Record<string, boolean>;
};

export function AdminSidebar({ isSuperuser, features }: AdminSidebarProps) {
    const pathname = usePathname();

    const filteredNavItems = navItems.filter((item) => {
        if (isSuperuser && item.id === "organization") {
            return false;
        }
        if (item.featureKey && features?.[item.featureKey] !== true) {
            return false;
        }
        return true;
    });

    return (
        <aside className="w-full md:max-w-56 md:shrink-0">
            <div className="md:sticky md:top-6">
                <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5">
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
                    <nav className="mt-5 space-y-2 text-sm">
                        {filteredNavItems.map((item) => {
                            const isActive = pathname === item.href;
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

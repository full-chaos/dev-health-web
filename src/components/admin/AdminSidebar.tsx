"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  id: string;
  label: string;
  href: string;
  description: string;
};

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/admin", description: "Overview" },
  { id: "users", label: "Users", href: "/admin/users", description: "Management" },
  { id: "organization", label: "Organization", href: "/admin/settings", description: "Settings" },
  { id: "integrations", label: "Integrations", href: "/admin/integrations", description: "Connectors" },
  { id: "sync", label: "Sync Status", href: "/admin/sync", description: "Jobs" },
  { id: "teams", label: "Teams", href: "/admin/teams", description: "Identity" },
  { id: "identities", label: "Identities", href: "/admin/identities", description: "Mapping" },
  { id: "audit", label: "Audit Logs", href: "/admin/audit-logs", description: "Enterprise" },
  { id: "ip-allowlist", label: "IP Allowlist", href: "/admin/ip-allowlist", description: "Security" },
  { id: "retention", label: "Retention", href: "/admin/retention", description: "Compliance" },
];

type AdminSidebarProps = {
  isSuperuser?: boolean;
};

export function AdminSidebar({ isSuperuser }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-full md:max-w-[220px] md:shrink-0">
      <div className="md:sticky md:top-6">
        <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-(--ink-muted)">
              Dev Health Ops
            </p>
            <p className="mt-3 font-(--font-display) text-lg">
              Admin
            </p>
            {isSuperuser && (
              <span className="mt-1 inline-flex items-center rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-purple-500">
                Platform Admin
              </span>
            )}
            <p className="mt-2 text-xs text-(--ink-muted)">
              System configuration and management.
            </p>
          </div>
          <nav className="mt-5 space-y-2 text-sm">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`group flex items-center justify-between rounded-2xl border px-3 py-2 transition ${isActive
                    ? "border-(--accent) bg-(--accent)/15 text-foreground"
                    : "border-transparent bg-(--card-70) text-(--ink-muted) hover:border-(--card-stroke) hover:text-foreground"
                    }`}
                >
                  <span className="font-medium">{item.label}</span>
                  <span
                    className={`text-[10px] uppercase tracking-widest ${isActive
                      ? "text-(--accent)"
                      : "text-(--ink-muted)"
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
                <span className="text-[10px] uppercase tracking-widest">Global</span>
              </Link>
            )}
          </nav>
          <div className="mt-5 rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-3 py-3 text-xs text-(--ink-muted)">
            Return to <Link href="/" className="underline hover:text-foreground">main app</Link>.
          </div>
        </div>
      </div>
    </aside>
  );
}

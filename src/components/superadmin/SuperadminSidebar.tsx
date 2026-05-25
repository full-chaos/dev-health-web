"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { id: "dashboard", label: "Dashboard", href: "/superadmin", description: "Overview" },
  { id: "orgs", label: "Organizations", href: "/superadmin/orgs", description: "Tenants" },
  { id: "users", label: "Users", href: "/superadmin/users", description: "Global" },
  { id: "licensing", label: "Licensing", href: "/superadmin/licensing", description: "Tiers" },
  {
    id: "product-telemetry",
    label: "Product Telemetry",
    href: "/superadmin/product-telemetry",
    description: "Usage",
  },
  { id: "audit", label: "Audit Log", href: "/superadmin/audit", description: "Events" },
  { id: "settings", label: "Settings", href: "/superadmin/settings", description: "Platform" },
  {
    id: "billing-plans",
    label: "Billing Plans",
    href: "/superadmin/billing/plans",
    description: "Pricing",
  },
  {
    id: "invoices",
    label: "Invoices",
    href: "/superadmin/billing/invoices",
    description: "Billing",
  },
  {
    id: "subscriptions",
    label: "Subscriptions",
    href: "/superadmin/billing/subscriptions",
    description: "Plans",
  },
  { id: "refunds", label: "Refunds", href: "/superadmin/billing/refunds", description: "Returns" },
  {
    id: "billing-audit",
    label: "Billing Audit",
    href: "/superadmin/billing/audit",
    description: "Finance",
  },
];

export function SuperadminSidebar({ canAccessOrgAdmin = false }: { canAccessOrgAdmin?: boolean }) {
  const pathname = usePathname();

  return (
    <aside className="w-full md:max-w-[220px] md:shrink-0">
      <div className="md:sticky md:top-6">
        <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
              Full Chaos Dev Health Ops
            </p>
            <p className="mt-3 font-(--font-display) text-lg">Superadmin</p>
            <span className="mt-1 inline-flex items-center rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-purple-500">
              Platform Admin
            </span>
            <p className="mt-2 text-xs text-(--ink-muted)">Global platform management.</p>
          </div>
          <nav className="mt-5 space-y-2 text-sm">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/superadmin" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`group flex items-center justify-between rounded-2xl border px-3 py-2 transition ${
                    isActive
                      ? "border-purple-500 bg-purple-500/15 text-foreground"
                      : "border-transparent bg-(--card-70) text-(--ink-muted) hover:border-(--card-stroke) hover:text-foreground"
                  }`}
                >
                  <span className="font-medium">{item.label}</span>
                  <span
                    className={`text-[10px] uppercase tracking-widest ${
                      isActive ? "text-purple-400" : "text-(--ink-muted)"
                    }`}
                  >
                    {item.description}
                  </span>
                </Link>
              );
            })}
          </nav>
          {canAccessOrgAdmin && (
            <div className="mt-5 rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-3 py-3 text-xs text-(--ink-muted)">
              Return to{" "}
              <Link href="/admin" className="underline hover:text-foreground">
                org admin
              </Link>
              .
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

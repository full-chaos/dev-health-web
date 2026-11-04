import { requireSuperuser } from "@/lib/auth";
import { scheduleShadow } from "@/lib/auth/shadow";

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
    const session = await requireSuperuser("/superadmin");
    scheduleShadow(session, ["guard:/superadmin"]);

    // Rendered inside the shared app shell (CHAOS-7967): the shell owns the navigation (Admin →
    // Platform / Platform billing, listed only for a platform admin), the page padding and the
    // `<main>` landmark. Each page's header brings the tab row of its destination.
    return <div className="flex min-w-0 flex-1 flex-col gap-10">{children}</div>;
}

import { Toaster } from "sonner";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { TrialBanner } from "@/components/billing/TrialBanner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AppShell } from "@/components/shell/AppShell";
import { TelemetryProvider } from "@/components/telemetry/TelemetryProvider";
import { getOrgEntitlements } from "@/lib/admin/server/billing";
import { requireSession } from "@/lib/auth";
import { GraphQLProvider } from "@/lib/graphql/provider";

export default async function AppLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const session = await requireSession();
    const entitlementResult = session.user.org_id
        ? await getOrgEntitlements(session.user.org_id)
        : undefined;
    const entitlements = entitlementResult?.data;
    const hasValidEntitlements = entitlements?.is_valid === true;

    // `AppShell` picks the chrome from the pathname: the shared app shell for a
    // route in the shell registry, the legacy account bar for every other route.
    const authenticatedShell = (
        <div className="min-h-screen bg-[image:var(--app-gradient)] bg-fixed">
            <AppShell
                themeToggle={<ThemeToggle />}
                banners={
                    <>
                        <ImpersonationBanner />
                        <TrialBanner />
                    </>
                }
            >
                {children}
            </AppShell>
            <Toaster
                containerAriaLabel="Notifications"
                position="top-right"
                richColors
                offset={{
                    top: "var(--toast-offset-top)",
                    right: "var(--toast-offset-inline)",
                }}
                mobileOffset={{
                    top: "var(--toast-offset-top)",
                    left: "var(--toast-offset-inline)",
                    right: "var(--toast-offset-inline)",
                }}
            />
        </div>
    );

    return (
        <SessionProvider>
            <AdminTierProvider
                tier={hasValidEntitlements ? entitlements.tier : "community"}
                features={hasValidEntitlements ? entitlements.features : {}}
                limits={hasValidEntitlements ? entitlements.limits : {}}
            >
                <GraphQLProvider orgId={session.user.org_id}>
                    <TelemetryProvider orgId={session.user.org_id} userId={session.user.id}>
                        {authenticatedShell}
                    </TelemetryProvider>
                </GraphQLProvider>
            </AdminTierProvider>
        </SessionProvider>
    );
}

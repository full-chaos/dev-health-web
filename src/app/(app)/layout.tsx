import { Toaster } from "sonner";

import { AdminNavProvider } from "@/components/admin/AdminTabs";
import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { TrialBanner } from "@/components/billing/TrialBanner";
import { EvidenceDrawerProvider } from "@/components/evidence/EvidenceDrawerProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AppShell } from "@/components/shell/AppShell";
import { TelemetryProvider } from "@/components/telemetry/TelemetryProvider";
import { getOrgEntitlements } from "@/lib/admin/server/billing";
import { requireSession } from "@/lib/auth";
import { GraphQLProvider } from "@/lib/graphql/provider";
import { boundedRead, withDeadline } from "@/lib/serverDeadline";

export default async function AppLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    // Both awaits run before any page streams, so each is bounded (CHAOS-9114). A session read
    // that hits its deadline throws a TimeoutError (the error boundary draws; the user is NOT
    // treated as logged out). Entitlements that hit it fall back to the existing "not valid" path.
    const session = await withDeadline(requireSession(), {
        kind: "auth",
        op: "step layout session",
    });
    const entitlementResult = session.user.org_id
        ? await boundedRead(getOrgEntitlements(session.user.org_id), "step layout entitlements")
        : undefined;
    const entitlements = entitlementResult?.data;
    const hasValidEntitlements = entitlements?.is_valid === true;

    // `AppShell` renders the shared app shell around every authed page.
    const authenticatedShell = (
        <div className="min-h-screen bg-[image:var(--app-gradient)] bg-fixed">
            {/* One "Evidence & Context" drawer for every authed page: a page header action, a
                card and a table row open it through `useEvidenceDrawer()`. */}
            <EvidenceDrawerProvider>
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
            </EvidenceDrawerProvider>
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
                {/* The shell lists the platform admin rows for a platform admin (CHAOS-7967);
                    the Admin pages read the same flag for their tab rows and pill. */}
                <AdminNavProvider isPlatformAdmin={session.user.is_superuser === true}>
                    <GraphQLProvider orgId={session.user.org_id}>
                        <TelemetryProvider orgId={session.user.org_id} userId={session.user.id}>
                            {authenticatedShell}
                        </TelemetryProvider>
                    </GraphQLProvider>
                </AdminNavProvider>
            </AdminTierProvider>
        </SessionProvider>
    );
}

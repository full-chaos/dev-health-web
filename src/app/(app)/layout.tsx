import { SessionProvider } from "@/components/auth/SessionProvider";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { TrialBanner } from "@/components/billing/TrialBanner";
import { BugReportButton } from "@/components/feedback/BugReportButton";
import { TelemetryProvider } from "@/components/telemetry/TelemetryProvider";
import { GraphQLProvider } from "@/lib/graphql/provider";
import { Toaster } from "sonner";
import { requireSession } from "@/lib/auth";
import { getOrgEntitlements } from "@/lib/admin/server/billing";

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

    return (
        <SessionProvider>
            <AdminTierProvider
                tier={hasValidEntitlements ? entitlements.tier : "community"}
                features={hasValidEntitlements ? entitlements.features : {}}
                limits={hasValidEntitlements ? entitlements.limits : {}}
            >
                <GraphQLProvider orgId={session.user.org_id}>
                    <TelemetryProvider orgId={session.user.org_id} userId={session.user.id}>
                        <div className="min-h-screen bg-[image:var(--app-gradient)] bg-fixed">
                            <ImpersonationBanner />
                            <TrialBanner />
                            {children}
                            <BugReportButton />
                            <Toaster richColors position="top-right" theme="dark" />
                        </div>
                    </TelemetryProvider>
                </GraphQLProvider>
            </AdminTierProvider>
        </SessionProvider>
    );
}

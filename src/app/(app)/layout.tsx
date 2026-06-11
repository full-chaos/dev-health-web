import { SessionProvider } from "@/components/auth/SessionProvider";
import { UserMenu } from "@/components/auth/UserMenu";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { TrialBanner } from "@/components/billing/TrialBanner";
import { BugReportButton } from "@/components/feedback/BugReportButton";
import { TelemetryProvider } from "@/components/telemetry/TelemetryProvider";
import { GraphQLProvider } from "@/lib/graphql/provider";
import { Toaster } from "sonner";
import { requireSession } from "@/lib/auth";
import { resolveActiveOrgId } from "@/lib/impersonation";

export default async function AppLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const session = await requireSession();
    // Impersonation-aware org scope: a superuser who belongs to an org must
    // query the impersonation target's org, not their own (CHAOS-2303).
    const activeOrgId = resolveActiveOrgId(session.user);

    return (
        <SessionProvider>
            <GraphQLProvider orgId={activeOrgId}>
                <TelemetryProvider orgId={activeOrgId} userId={session.user.id}>
                    <div className="min-h-screen bg-[image:var(--app-gradient)] bg-fixed">
                        <div className="fixed right-6 top-6 z-50">
                            <UserMenu />
                        </div>
                        <ImpersonationBanner />
                        <TrialBanner />
                        {children}
                        <BugReportButton />
                        <Toaster richColors position="top-right" theme="dark" />
                    </div>
                </TelemetryProvider>
            </GraphQLProvider>
        </SessionProvider>
    );
}

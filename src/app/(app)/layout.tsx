import { SessionProvider } from "@/components/auth/SessionProvider";
import { UserMenu } from "@/components/auth/UserMenu";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { TrialBanner } from "@/components/billing/TrialBanner";
import { BugReportButton } from "@/components/feedback/BugReportButton";
import { TelemetryProvider } from "@/components/telemetry/TelemetryProvider";
import { GraphQLProvider } from "@/lib/graphql/provider";
import { Toaster } from "sonner";
import { requireSession } from "@/lib/auth";

export default async function AppLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const session = await requireSession();

    return (
        <SessionProvider session={session}>
            <GraphQLProvider orgId={session.user.org_id}>
                <TelemetryProvider orgId={session.user.org_id} userId={session.user.id}>
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

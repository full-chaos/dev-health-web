import Image from "next/image";
import Link from "next/link";
import { Toaster } from "sonner";

import fcLogo from "@/assets/fc-logo.png";
import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { UserMenu } from "@/components/auth/UserMenu";
import { TrialBanner } from "@/components/billing/TrialBanner";
import { BugReportButton } from "@/components/feedback/BugReportButton";
import { AskDevProvider } from "@/components/ask-dev/AskDevProvider";
import { TelemetryProvider } from "@/components/telemetry/TelemetryProvider";
import { getOrgEntitlements } from "@/lib/admin/server/billing";
import { requireSession } from "@/lib/auth";
import { GraphQLProvider } from "@/lib/graphql/provider";
import { CTA_LABELS } from "@/lib/design/cta";

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
    const askDevEnabled = hasValidEntitlements && entitlements.features.ask_dev === true;

    const authenticatedShell = (
        <div className="min-h-screen bg-[image:var(--app-gradient)] bg-fixed">
            <ImpersonationBanner />
            <TrialBanner />
            <header className="relative z-40 border-b border-(--card-stroke) bg-(--card-80)">
                <nav
                    aria-label="Account"
                    className="flex min-h-14 items-center justify-between px-4 py-3 sm:px-6"
                >
                    <Link
                        href="/dashboard"
                        aria-label={CTA_LABELS.devHealthCockpit}
                        className="flex items-center gap-2 rounded-md"
                    >
                        <Image
                            src={fcLogo}
                            alt="Full Chaos Dev Health logo"
                            width={32}
                            height={32}
                            sizes="32px"
                            className="h-8 w-auto"
                            priority
                        />
                        <span className="hidden text-sm font-semibold tracking-tight text-(--text-primary) sm:inline">
                            Full Chaos Dev Health
                        </span>
                    </Link>
                    <UserMenu />
                </nav>
            </header>
            {children}
            <BugReportButton />
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
                        {askDevEnabled && session.user.org_id ? (
                            <AskDevProvider
                                orgId={session.user.org_id}
                                contextualEntrypointsEnabled={
                                    entitlements.features.ask_dev_contextual_entrypoints === true
                                }
                            >
                                {authenticatedShell}
                            </AskDevProvider>
                        ) : (
                            authenticatedShell
                        )}
                    </TelemetryProvider>
                </GraphQLProvider>
            </AdminTierProvider>
        </SessionProvider>
    );
}

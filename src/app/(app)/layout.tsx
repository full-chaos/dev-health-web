import { SessionProvider } from "@/components/auth/SessionProvider";
import { UserMenu } from "@/components/auth/UserMenu";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { BugReportButton } from "@/components/feedback/BugReportButton";
import { GraphQLProvider } from "@/lib/graphql/provider";
import { Toaster } from "sonner";
import { requireSession } from "@/lib/auth";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireSession();

  return (
    <SessionProvider>
      <GraphQLProvider>
        <div className="fixed right-6 top-6 z-50">
          <UserMenu />
        </div>
        <ImpersonationBanner />
        {children}
        <BugReportButton />
        <Toaster richColors position="top-right" theme="dark" />
      </GraphQLProvider>
    </SessionProvider>
  );
}

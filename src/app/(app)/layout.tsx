import { SessionProvider } from "@/components/auth/SessionProvider";
import { UserMenu } from "@/components/auth/UserMenu";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { GraphQLProvider } from "@/lib/graphql/provider";
import { Toaster } from "sonner";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SessionProvider>
      <GraphQLProvider>
        <div className="fixed right-6 top-6 z-50">
          <UserMenu />
        </div>
        <ImpersonationBanner />
        {children}
        <Toaster richColors position="top-right" theme="dark" />
      </GraphQLProvider>
    </SessionProvider>
  );
}

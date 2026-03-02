import { SessionProvider } from "@/components/auth/SessionProvider";
import { Toaster } from "sonner";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SessionProvider>
      {children}
      <Toaster richColors position="top-right" theme="dark" />
    </SessionProvider>
  );
}

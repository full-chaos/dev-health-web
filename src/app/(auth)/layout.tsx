import Link from "next/link";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { BetaBadge } from "@/components/BetaBadge";
import { Toaster } from "sonner";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SessionProvider>
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2" aria-label="Dev Health home">
          <span className="font-(--font-display) text-lg font-semibold tracking-tight">
            Dev Health
          </span>
          <span className="rounded-full border border-(--card-stroke) bg-(--card-70) px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-(--ink-muted)">
            OSS
          </span>
          <BetaBadge />
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/pricing"
            className="text-sm text-(--ink-muted) transition hover:text-foreground"
          >
            Pricing
          </Link>
          <Link
            href="/auth/signin"
            className="text-sm text-(--ink-muted) transition hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/auth/signup"
            className="rounded-full bg-(--accent) px-5 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            Get started
          </Link>
        </div>
      </nav>
      {children}
      <Toaster richColors position="top-right" theme="dark" />
    </SessionProvider>
  );
}

import Image from "next/image";
import Link from "next/link";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { BetaBadge } from "@/components/BetaBadge";
import fcLogo from "@/assets/fc-logo.png";
import { CTA_LABELS } from "@/lib/design/cta";
import { Toaster } from "sonner";

export default function AuthLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <SessionProvider>
            <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6">
                <div className="flex items-center gap-3">
                    <Link
                        href="/"
                        className="flex items-center"
                        aria-label={CTA_LABELS.devHealthHome}
                    >
                        <Image
                            src={fcLogo}
                            alt="Full Chaos Dev Health logo"
                            className="mr-2 h-10 w-auto"
                        />
                        <div className="flex flex-col">
                            <span className="text-lg font-semibold leading-tight tracking-tight">
                                Full Chaos
                            </span>
                            <span className="text-xs font-semibold tracking-tight text-(--ink-muted)">
                                Dev Health
                            </span>
                        </div>
                    </Link>
                    <div className="flex items-center gap-1.5">
                        <span className="rounded-full border border-(--card-stroke) bg-(--card-70) px-2.5 py-0.5 text-label-caps font-semibold uppercase tracking-[0.2em] text-(--ink-muted)">
                            OSS
                        </span>
                        <BetaBadge />
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <Link
                        href="/marketing/pricing"
                        className="text-sm text-(--ink-muted) transition hover:text-foreground"
                    >
                        {CTA_LABELS.pricing}
                    </Link>
                    <Link
                        href="/auth/signin"
                        className="text-sm text-(--ink-muted) transition hover:text-foreground"
                    >
                        {CTA_LABELS.signIn}
                    </Link>
                    <Link
                        href="/auth/signup"
                        className="rounded-full bg-(--accent) px-5 py-2 text-sm font-medium text-white transition hover:opacity-90"
                    >
                        {CTA_LABELS.getStarted}
                    </Link>
                </div>
            </nav>
            <main>{children}</main>
            <Toaster
                containerAriaLabel="Notifications"
                position="top-right"
                richColors={false}
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
        </SessionProvider>
    );
}

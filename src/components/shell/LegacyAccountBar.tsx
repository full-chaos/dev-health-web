import Image from "next/image";
import Link from "next/link";

import fcLogo from "@/assets/fc-logo.png";
import { UserMenu } from "@/components/auth/UserMenu";
import { CTA_LABELS } from "@/lib/design/cta";

/**
 * The account bar every authed page had before the shared app shell: brand link
 * plus the account menu. Moved here from `(app)/layout.tsx` without a change.
 *
 * It is the top chrome of every route outside the shell registry, and the top
 * chrome of shell routes below the `md` breakpoint (the mobile slide-over is a
 * later change). It is deleted when the last route moves into the shell.
 */
export function LegacyAccountBar() {
    return (
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
    );
}

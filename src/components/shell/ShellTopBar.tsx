"use client";

import { Suspense, type ReactNode } from "react";
import { Library } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { navTrailForPathname } from "@/lib/navigation/areas";
import {
    useEvidenceDrawer,
    usePageEvidenceSubject,
} from "@/components/evidence/EvidenceDrawerProvider";
import { CTA_LABELS } from "@/lib/design/cta";
import { metricEvidenceLeaf } from "@/lib/navigation/evidenceTrail";

import { CommandPalette } from "./CommandPalette";
import { shellHref } from "./shellHref";
import { useShellNavParams } from "./useShellNavParams";

type ShellTopBarProps = {
    /** Slot for the light / dark toggle. Empty until the toggle is mounted. */
    themeToggle?: ReactNode;
};

/**
 * The location trail with the user's state on its links. A crumb link is the
 * page's return path (it replaces the in-page "Back to {area}" link), so it
 * carries what that link carried: the filter (`f`), `role`, `lens` and `origin`.
 */
function ShellTrail({ pathname }: { pathname: string }) {
    const params = useShellNavParams(pathname);
    const searchParams = useSearchParams();
    const leaf = metricEvidenceLeaf(pathname, {
        metric: searchParams.get("metric"),
        api: searchParams.get("api"),
    });
    const trail = navTrailForPathname(pathname, leaf ?? undefined).map((crumb) =>
        crumb.href
            ? { ...crumb, href: shellHref(crumb.href, params, { withOrigin: true }) }
            : crumb,
    );
    return <Breadcrumbs items={trail} />;
}

/**
 * The "Sources" entry: opens the shared evidence drawer for the current page's evidence. A page
 * with no page-level evidence registers none, and the entry is not rendered (no dead button).
 */
function SourcesEntry() {
    const subject = usePageEvidenceSubject();
    if (!subject) return null;
    return <SourcesButton subject={subject} />;
}

function SourcesButton({
    subject,
}: {
    subject: NonNullable<ReturnType<typeof usePageEvidenceSubject>>;
}) {
    const evidence = useEvidenceDrawer();
    return (
        <button
            type="button"
            data-testid="top-bar-sources"
            onClick={() => evidence.open(subject)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-(--card-stroke) bg-(--background) px-3 text-xs font-medium text-foreground transition-colors hover:bg-(--surface-raised) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
        >
            <Library className="size-3.5" aria-hidden="true" />
            {CTA_LABELS.sources}
        </button>
    );
}

/**
 * Top bar of the shared app shell: the location trail from the nav config (A6:
 * breadcrumb label = sidebar label), and a slot for the
 * theme toggle. Shown from the `md` breakpoint up; below it the mobile bar
 * is the top chrome.
 */
export function ShellTopBar({ themeToggle }: ShellTopBarProps) {
    const pathname = usePathname() ?? "";

    return (
        <header
            data-testid="shell-top-bar"
            className="sticky top-0 z-30 hidden h-(--shell-topbar-h) items-center gap-4 border-b border-(--border) bg-(--surface)/92 px-6 backdrop-blur-sm md:flex"
        >
            <div className="min-w-48 shrink-0">
                {/* The links read the live query string; the bare trail is the fallback. */}
                <Suspense fallback={<Breadcrumbs items={navTrailForPathname(pathname)} />}>
                    <ShellTrail pathname={pathname} />
                </Suspense>
            </div>
            {/* Prototype `.topbar`: breadcrumb, then the search, then the toggle. */}
            <CommandPalette />
            <div className="ml-auto flex shrink-0 items-center gap-3">
                <SourcesEntry />
                <div data-slot="theme-toggle" className="flex items-center empty:hidden">
                    {themeToggle}
                </div>
            </div>
        </header>
    );
}

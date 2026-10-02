import Link from "next/link";
import type { ReactNode } from "react";

export type ModeTabItem<TId extends string = string> = {
    id: TId;
    label: string;
    href: string;
    /** Optional trailing badge (e.g. a "Preview" chip). */
    badge?: ReactNode;
};

type ModeTabsProps<TId extends string = string> = {
    items: ReadonlyArray<ModeTabItem<TId>>;
    activeId: TId;
    /** Accessible name for the tab strip. */
    ariaLabel: string;
    className?: string;
};

// Prototype `.tabs` / `.tab` (style.css, theme.css:55): sentence case 13px, 24px apart, a hairline under
// the row; the current tab is heavier, in ink, with a 2px --ember gradient underline (not flat).
export const TAB_CONTAINER =
    "flex items-center gap-6 overflow-x-auto whitespace-nowrap border-b border-(--card-stroke) px-1 scrollbar-hide";

export const TAB_BASE =
    "-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-0.5 pb-3 pt-2 text-[0.8125rem] transition-colors";

export const TAB_ACTIVE =
    "font-bold text-foreground bg-(image:--ember) bg-bottom bg-no-repeat bg-size-[100%_2px]";
export const TAB_INACTIVE = "text-(--ink-muted) hover:text-foreground";

/**
 * Shared route-tab strip primitive (framework A2).
 *
 * The underline idiom — a horizontal strip of route links with a bottom-border
 * active indicator — is reserved for switching between *modes / sub-views of
 * the same screen* (Work tabs, AI Workflow tabs, …). It is intentionally
 * distinct from {@link FilterPills} (rounded segmented selection) and
 * {@link BackLink} (return path). Do not mix the idioms.
 *
 * Each tab is a real `<a>` (Next `Link`) so destinations stay deep-linkable.
 */
export function ModeTabs<TId extends string = string>({
    items,
    activeId,
    ariaLabel,
    className,
}: ModeTabsProps<TId>) {
    return (
        <nav aria-label={ariaLabel} className={`${TAB_CONTAINER} ${className ?? ""}`.trim()}>
            {items.map((tab) => {
                const isActive = tab.id === activeId;
                return (
                    <Link
                        key={tab.id}
                        href={tab.href}
                        aria-current={isActive ? "page" : undefined}
                        className={`${TAB_BASE} ${isActive ? TAB_ACTIVE : TAB_INACTIVE}`}
                    >
                        {tab.label}
                        {tab.badge}
                    </Link>
                );
            })}
        </nav>
    );
}

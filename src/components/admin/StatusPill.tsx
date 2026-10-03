import type { ComponentType, ReactNode } from "react";

import { STATUS_PILL, type StatusPillTone } from "@/lib/statusPill";

/**
 * The admin pill: an icon and a word, tone from the status tokens, no border (design R15 / A2-A7).
 * `outline` is the neutral kind pill (for example the auth provider): a hairline, no wash. The word
 * carries the meaning; the icon is decoration.
 */
export type StatusPillProps = {
    tone?: StatusPillTone | "outline";
    icon?: ComponentType<{ className?: string; "aria-hidden"?: "true" }>;
    children: ReactNode;
    className?: string;
    testId?: string;
};

const BASE = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold";

export function StatusPill({
    tone = "muted",
    icon: Icon,
    children,
    className = "",
    testId,
}: StatusPillProps) {
    const look =
        tone === "outline"
            ? "border border-(--card-stroke) text-foreground"
            : STATUS_PILL[tone].replace(/\bborder-\S+/gu, "").trim();
    return (
        <span data-testid={testId} className={`${BASE} ${look} ${className}`.trim()}>
            {Icon ? <Icon aria-hidden="true" className="h-3 w-3" /> : null}
            {children}
        </span>
    );
}

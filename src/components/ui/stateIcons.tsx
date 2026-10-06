import type { ReactNode } from "react";
import { CircleHelp, Database, Eye, Hourglass, Inbox, Unplug } from "lucide-react";

/**
 * Default icon per empty / unavailable variant (concept `.empty`: a muted line icon, a title,
 * a sentence). The icon tells the cases apart; none implies health (no check mark, no green).
 */
const icon = (Icon: typeof Database): ReactNode => <Icon aria-hidden="true" />;

export const STATE_ICONS = {
    "no-data-window": icon(Database),
    "no-data-connected": icon(Database),
    "source-unsupported": icon(Unplug),
    "detector-unavailable": icon(CircleHelp),
    "detector-enabled-no-findings": icon(Inbox),
    "no-findings": icon(Inbox),
    "insufficient-confidence": icon(Hourglass),
    "preview-not-populated": icon(Eye),
} as const satisfies Record<string, ReactNode>;

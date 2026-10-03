/**
 * Status pill classes: status token text on the status wash token (prototype
 * `greenWash` etc.), with a 30% border (the border shows only where the pill sets `border`).
 * Theme tokens only, so a pill reads in light and in dark. `muted` is neutral
 * (not a status): ink-muted text on the card stroke. Tailwind sees the full class
 * strings here, so keep them literal.
 */
export const STATUS_PILL = {
    positive: "border-(--positive)/30 bg-(--positive-wash) text-(--positive)",
    negative: "border-(--negative)/30 bg-(--negative-wash) text-(--negative)",
    caution: "border-(--caution)/30 bg-(--caution-wash) text-(--caution)",
    info: "border-(--info)/30 bg-(--info-wash) text-(--info)",
    muted: "border-(--card-stroke) bg-(--card-stroke) text-(--ink-muted)",
} as const;

export type StatusPillTone = keyof typeof STATUS_PILL;

/** Status dot fills (same tokens as the pill text). */
export const STATUS_DOT = {
    positive: "bg-(--positive)",
    negative: "bg-(--negative)",
    caution: "bg-(--caution)",
    info: "bg-(--info)",
    muted: "bg-(--ink-muted)",
} as const;

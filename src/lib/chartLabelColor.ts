import { contrastRatio, pickTextColor } from "@/lib/heatmapRamp";

const HEX = /^#?([0-9a-f]{6})$/iu;

/** Minimum contrast for label text on a tile (WCAG AA, normal text). */
export const MIN_LABEL_CONTRAST = 4.5;

/** Depth opacity steps for charts that carry no evidence-quality opacity. */
export const DEPTH_OPACITY = [1, 0.82, 0.66] as const;

export const depthOpacity = (depth: number): number =>
    DEPTH_OPACITY[Math.min(Math.max(depth, 0), DEPTH_OPACITY.length - 1)];

/** The color a `fill` at `opacity` shows over `backdrop` (all `#rrggbb`). */
export const blendOver = (fill: string, opacity: number, backdrop: string): string => {
    const f = HEX.exec(fill.trim());
    const b = HEX.exec(backdrop.trim());
    if (!f || !b) return fill;
    const fv = Number.parseInt(f[1], 16);
    const bv = Number.parseInt(b[1], 16);
    const a = Math.min(1, Math.max(0, opacity));
    const ch = (shift: number) =>
        Math.round(((fv >> shift) & 255) * a + ((bv >> shift) & 255) * (1 - a));
    return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
};

/**
 * Label color for a tile: the ink or card color with the higher contrast against the
 * tile's actual (blended) fill. Returns null when neither reaches 4.5, so the caller hides
 * the label rather than print unreadable text.
 */
export const tileLabelColor = (
    fill: string,
    opacity: number | undefined,
    backdrop: string,
    candidates: readonly [string, string],
): string | null => {
    const shown = blendOver(fill, opacity ?? 1, backdrop);
    if (!HEX.test(shown.trim())) return candidates[0];
    const best = pickTextColor(shown, candidates);
    return contrastRatio(best, shown) >= MIN_LABEL_CONTRAST ? best : null;
};

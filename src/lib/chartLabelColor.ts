import { contrastRatio, pickTextColor } from "@/lib/heatmapRamp";

const HEX = /^#?([0-9a-f]{6})$/iu;

/**
 * Fixed label-ink pair for text printed ON a series fill (tiles, ring segments).
 * Not theme text and not theme tokens: a series fill is the same hue in both themes, so its
 * label ink is chosen per fill by contrast and does not follow the theme.
 */
export const LABEL_INK_LIGHT = "#ffffff";
// Near-black, not #15171a: with white it leaves NO dead zone. The best of the pair reaches 4.5:1 on
// every fill (worst case 4.53:1 at a fill luminance of 0.18), so a label never needs a halo or a
// shadow (CHAOS-8510). With #15171a the worst case was 4.24:1 and mid-tone reds got a shadow.
export const LABEL_INK_DARK = "#050505";
const LABEL_INK = [LABEL_INK_LIGHT, LABEL_INK_DARK] as const;

/** Contrast a label should reach (WCAG AA, normal text). The ink pair reaches it on every fill. */
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

export type TileLabel = {
    /** The higher-contrast of the fixed ink pair against the blended fill. */
    color: string;
};

export const tileLabel = (
    fill: string,
    opacity: number | undefined,
    backdrop: string,
): TileLabel => {
    const shown = blendOver(fill, opacity ?? 1, backdrop);
    if (!HEX.test(shown.trim())) return { color: LABEL_INK_DARK };
    return { color: pickTextColor(shown, LABEL_INK) };
};

/** ECharts label fragment for `tileLabel`: the ink only, never a text border or shadow. */
export const tileLabelStyle = (
    fill: string,
    opacity: number | undefined,
    backdrop: string,
): { color: string; textBorderWidth: 0 } => ({
    color: tileLabel(fill, opacity, backdrop).color,
    textBorderWidth: 0,
});

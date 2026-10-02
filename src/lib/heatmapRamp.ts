/**
 * One-hue heatmap ramp helpers. The ramp itself comes from the theme tokens
 * (`--seq-0..5`); nothing here holds a color literal.
 */

export type HeatmapScale = "linear" | "log";

const parseHex = (hex: string): [number, number, number] | null => {
    const match = /^#?([0-9a-f]{6})$/iu.exec(hex.trim());
    if (!match) {
        return null;
    }
    const value = Number.parseInt(match[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const toHex = (channels: number[]) =>
    `#${channels.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

/** Position of `value` between `min` and `max` on the legend scale, 0 to 1. */
export const rampPosition = (
    value: number,
    min: number,
    max: number,
    scale: HeatmapScale = "linear",
): number => {
    const map = (v: number) => (scale === "log" ? Math.log10(Math.max(v, 0) + 1) : v);
    const lo = map(min);
    const hi = map(max);
    if (!(hi > lo)) {
        return 1;
    }
    return Math.min(1, Math.max(0, (map(value) - lo) / (hi - lo)));
};

/** Color at position `t` (0 to 1) along `ramp`, interpolated between its stops. */
export const rampColor = (t: number, ramp: readonly string[]): string => {
    if (ramp.length === 0) {
        return "";
    }
    const clamped = Math.min(1, Math.max(0, t));
    const scaled = clamped * (ramp.length - 1);
    const index = Math.min(ramp.length - 2, Math.floor(scaled));
    if (ramp.length === 1) {
        return ramp[0];
    }
    const from = parseHex(ramp[index]);
    const to = parseHex(ramp[index + 1]);
    if (!from || !to) {
        return ramp[Math.round(scaled)] ?? ramp[0];
    }
    const mix = scaled - index;
    return toHex(from.map((channel, i) => channel + (to[i] - channel) * mix));
};

const luminance = (hex: string): number => {
    const channels = parseHex(hex);
    if (!channels) {
        return 0;
    }
    const [r, g, b] = channels.map((c) => {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (a: string, b: string): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

/** The candidate text color with the higher contrast on `fill`. */
export const pickTextColor = (fill: string, candidates: readonly string[]): string =>
    candidates.reduce((best, next) =>
        contrastRatio(next, fill) > contrastRatio(best, fill) ? next : best,
    );

/** Mid-scale label value: the arithmetic middle for linear, the geometric one for log. */
export const scaleMidpoint = (min: number, max: number, scale: HeatmapScale): number =>
    scale === "log" ? 10 ** ((Math.log10(min + 1) + Math.log10(max + 1)) / 2) - 1 : (min + max) / 2;

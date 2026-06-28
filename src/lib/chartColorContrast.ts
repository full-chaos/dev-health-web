const DARK_TEXT = "#111827";
const LIGHT_TEXT = "#f9fafb";

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

type Rgb = {
    r: number;
    g: number;
    b: number;
};

const parseHexColor = (color: string): Rgb | null => {
    const normalized = color.trim().replace(/^#/, "");
    const hex =
        normalized.length === 3
            ? normalized
                  .split("")
                  .map((char) => `${char}${char}`)
                  .join("")
            : normalized;

    if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
        return null;
    }

    const value = Number.parseInt(hex, 16);
    return {
        r: (value >> 16) & 0xff,
        g: (value >> 8) & 0xff,
        b: value & 0xff,
    };
};

const blendRgb = (foreground: Rgb, background: Rgb, opacity = 1): Rgb => {
    const alpha = clamp(opacity);
    return {
        r: foreground.r * alpha + background.r * (1 - alpha),
        g: foreground.g * alpha + background.g * (1 - alpha),
        b: foreground.b * alpha + background.b * (1 - alpha),
    };
};

const relativeLuminance = ({ r, g, b }: Rgb) => {
    const transform = (channel: number) => {
        const srgb = channel / 255;
        return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    };

    return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
};

const contrastRatio = (foreground: Rgb, background: Rgb) => {
    const foregroundLum = relativeLuminance(foreground);
    const backgroundLum = relativeLuminance(background);
    const lighter = Math.max(foregroundLum, backgroundLum);
    const darker = Math.min(foregroundLum, backgroundLum);
    return (lighter + 0.05) / (darker + 0.05);
};

export const getAccessibleTextColor = (
    fillColor: string | undefined,
    surfaceColor: string,
    fallbackColor: string,
    opacity?: number,
) => {
    if (!fillColor) {
        return fallbackColor;
    }

    const fillRgb = parseHexColor(fillColor);
    if (!fillRgb) {
        return fallbackColor;
    }

    const surfaceRgb = parseHexColor(surfaceColor) ?? parseHexColor(DARK_TEXT);
    const effectiveFill = surfaceRgb ? blendRgb(fillRgb, surfaceRgb, opacity ?? 1) : fillRgb;
    const lightRgb = parseHexColor(LIGHT_TEXT);
    const darkRgb = parseHexColor(DARK_TEXT);

    if (!lightRgb || !darkRgb) {
        return fallbackColor;
    }

    return contrastRatio(darkRgb, effectiveFill) >= contrastRatio(lightRgb, effectiveFill)
        ? DARK_TEXT
        : LIGHT_TEXT;
};

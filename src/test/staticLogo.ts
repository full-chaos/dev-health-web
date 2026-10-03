import { expect } from "vitest";

/**
 * CHAOS-8545: the logo is served as a small static file, not through the
 * image optimizer (`/_next/image`).
 *
 * In a test the import of a PNG file is its path, so the `src` of an
 * unoptimized image is that path. An optimized image has a
 * `/_next/image?url=…` source and a `srcset`.
 */
export function expectStaticLogo(
    image: HTMLElement,
    expected: { file: string; width: number; height: number },
): void {
    const src = image.getAttribute("src") ?? "";
    expect(src).not.toContain("/_next/image");
    expect(src.split("?")[0].endsWith(`/${expected.file}`), `logo src is ${src}`).toBe(true);
    expect(image).not.toHaveAttribute("srcset");
    expect(image).toHaveAttribute("width", String(expected.width));
    expect(image).toHaveAttribute("height", String(expected.height));
}

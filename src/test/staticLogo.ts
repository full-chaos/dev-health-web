import { expect } from "vitest";

/**
 * CHAOS-8545: the logo is an SVG file that the app serves as a static file,
 * not through the image optimizer (`/_next/image`). `next/image` does this
 * by itself for a source that ends with `.svg`.
 *
 * In a test the import of an image file is its path, so the `src` of an
 * image that is not optimized is that path. An optimized image has a
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

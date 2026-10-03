/**
 * CHAOS-8545: the logo files the app serves are small, and the 5 MB logo
 * source is not served.
 *
 * `scripts/make-logo-assets.mjs` makes the two files from
 * `src/assets/fc-logo.png` at three times the height of the box each one is
 * drawn in, as WebP at quality 75 (the encoding the image optimizer used). The
 * app serves them as static files (`unoptimized`), so their size on disk is
 * the size the browser downloads. This test checks the committed files, not
 * the script: the pixel sizes, the byte bounds, and that no source file
 * imports the 5 MB source.
 *
 * The byte bounds are the measured sizes (6,500 and 8,894 bytes) plus a small
 * margin. Before this change a 3x screen got 5,892 bytes for the shell logo
 * from the optimizer; a file above the bound means the logo costs more than
 * it did.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ASSETS = path.join(ROOT, "src/assets");

/** Width and height from the IHDR chunk of a PNG file. */
function pngSize(file) {
    const bytes = readFileSync(file);
    expect(bytes.subarray(0, 8).toString("hex"), `${file} is not a PNG file`).toBe(
        "89504e470d0a1a0a",
    );
    expect(bytes.toString("latin1", 12, 16)).toBe("IHDR");
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Width and height from the first chunk of a WebP file (extended, lossy or lossless). */
function webpSize(file) {
    const bytes = readFileSync(file);
    expect(
        `${bytes.toString("latin1", 0, 4)}/${bytes.toString("latin1", 8, 12)}`,
        `${file} is not a WebP file`,
    ).toBe("RIFF/WEBP");
    const chunk = bytes.toString("latin1", 12, 16);
    if (chunk === "VP8X") {
        return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
    }
    if (chunk === "VP8 ") {
        return {
            width: bytes.readUInt16LE(26) & 0x3fff,
            height: bytes.readUInt16LE(28) & 0x3fff,
        };
    }
    if (chunk === "VP8L") {
        const bits = bytes.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    throw new Error(`${file}: unknown WebP chunk ${JSON.stringify(chunk)}`);
}

function sourceFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return /\.(ts|tsx|js|jsx|mjs|css)$/.test(entry.name) ? [full] : [];
    });
}

describe("logo assets (CHAOS-8545)", () => {
    const source = pngSize(path.join(ASSETS, "fc-logo.png"));

    it.each([
        {
            file: "fc-logo-96.webp",
            height: 96,
            width: 106,
            maxBytes: 8_000,
            box: "32 px (app shell)",
        },
        {
            file: "fc-logo-120.webp",
            height: 120,
            width: 133,
            maxBytes: 10_000,
            box: "40 px (sign-in, marketing)",
        },
    ])(
        "$file is $width x $height px, three times its $box box, and below $maxBytes bytes",
        (asset) => {
            const file = path.join(ASSETS, asset.file);

            expect(webpSize(file)).toEqual({ width: asset.width, height: asset.height });
            // The same shape as the source: the width follows from the source ratio.
            expect(asset.width).toBe(Math.round((asset.height * source.width) / source.height));
            expect(statSync(file).size).toBeLessThan(asset.maxBytes);
        },
    );

    it("no source file imports the 5 MB logo source", () => {
        const importers = sourceFiles(path.join(ROOT, "src"))
            .filter((file) => /assets\/fc-logo\.png/.test(readFileSync(file, "utf8")))
            .map((file) => path.relative(ROOT, file));

        expect(importers).toEqual([]);
    });

    it("the PNG files of the first version of this change are gone", () => {
        const stale = readdirSync(ASSETS).filter((name) => /^fc-logo-\d+\.png$/.test(name));

        expect(stale).toEqual([]);
    });
});

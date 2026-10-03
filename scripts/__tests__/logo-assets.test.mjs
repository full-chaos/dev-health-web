/**
 * CHAOS-8545: the logo files the app serves are small, and the 5 MB logo
 * source is not served.
 *
 * `scripts/make-logo-assets.mjs` makes the two files from
 * `src/assets/fc-logo.png` at three times the height of the box each one is
 * drawn in. The app serves them as static files (`unoptimized`), so their size
 * on disk is the size the browser downloads. This test checks the committed
 * files, not the script: the pixel sizes, the byte bound, and that no source
 * file imports the 5 MB source.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ASSETS = path.join(ROOT, "src/assets");
const MAX_BYTES = 40_000;

/** Width and height from the IHDR chunk of a PNG file. */
function pngSize(file) {
    const bytes = readFileSync(file);
    expect(bytes.subarray(0, 8).toString("hex"), `${file} is not a PNG file`).toBe(
        "89504e470d0a1a0a",
    );
    expect(bytes.toString("latin1", 12, 16)).toBe("IHDR");
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
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
        { file: "fc-logo-96.png", height: 96, width: 106, box: "32 px (app shell)" },
        { file: "fc-logo-120.png", height: 120, width: 133, box: "40 px (sign-in, marketing)" },
    ])("$file is $width x $height px, three times its $box box, and below 40 kB", (asset) => {
        const file = path.join(ASSETS, asset.file);

        expect(pngSize(file)).toEqual({ width: asset.width, height: asset.height });
        // The same shape as the source: the width follows from the source ratio.
        expect(asset.width).toBe(Math.round((asset.height * source.width) / source.height));
        expect(statSync(file).size).toBeLessThan(MAX_BYTES);
    });

    it("no source file imports the 5 MB logo source", () => {
        const importers = sourceFiles(path.join(ROOT, "src"))
            .filter((file) => /assets\/fc-logo\.png/.test(readFileSync(file, "utf8")))
            .map((file) => path.relative(ROOT, file));

        expect(importers).toEqual([]);
    });
});

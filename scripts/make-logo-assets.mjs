#!/usr/bin/env node
// CHAOS-8545: makes the small logo files that the app serves.
//
// The logo source, src/assets/fc-logo.png, is 2550 x 2300 px and about 5 MB.
// The app drew it in a 32 px and a 40 px box through the image optimizer. The
// files below are the source at three times the box height, in the encoding
// the optimizer used (WebP, quality 75), so the app can serve them as static
// files, with no optimizer request and no more bytes than a 3x screen got
// before.
//
// One-off: run `node scripts/make-logo-assets.mjs` after a change of the logo
// source and commit the output. No build step runs this file.
// scripts/__tests__/logo-assets.test.mjs checks the committed output.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
// sharp is not a dependency of this repo. `next` brings it, so it is resolved
// from the `next` package.
const sharp = require(require.resolve("sharp", { paths: [require.resolve("next/package.json")] }));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "src/assets/fc-logo.png");

/** `height` is three times the CSS height of the box the file is drawn in. */
const outputs = [
    // App shell (sidebar and mobile bar): `h-8`, a 32 px box.
    { height: 96, file: "src/assets/fc-logo-96.webp" },
    // Sign-in and marketing header: `h-10`, a 40 px box.
    { height: 120, file: "src/assets/fc-logo-120.webp" },
];

for (const { height, file } of outputs) {
    const info = await sharp(source)
        .resize({ height })
        .webp({ quality: 75 })
        .toFile(path.join(root, file));
    console.log(`${file}: ${info.width} x ${info.height} px, ${info.size} bytes`);
}

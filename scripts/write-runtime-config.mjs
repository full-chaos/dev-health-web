import fs from "node:fs";
import path from "node:path";

import { ACR_PUBLIC_KEYS, acrPublicEnv } from "./runtime-config-acr.mjs";

const outputPath = path.join(process.cwd(), "public", "runtime-config.js");
const publicEnv = Object.fromEntries(
    Object.entries(process.env).filter(
        ([key, value]) => key.startsWith("NEXT_PUBLIC_") && value !== undefined,
    ),
);

if (
    publicEnv.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS === undefined &&
    process.env.USE_GRAPHQL_ANALYTICS !== undefined
) {
    publicEnv.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS = process.env.USE_GRAPHQL_ANALYTICS;
}

publicEnv.NEXT_PUBLIC_DOCS_URL = publicEnv.NEXT_PUBLIC_DOCS_URL || "/docs";

// CHAOS-12302: the browser's ACR OAuth client values come only from the server settings, and only
// when ACR_OAUTH_ISSUER is set. The same keys set directly in the environment are dropped first, so
// they cannot turn the client on past that switch.
for (const key of ACR_PUBLIC_KEYS) delete publicEnv[key];
Object.assign(publicEnv, acrPublicEnv(process.env));

const payload = {
    publicEnv,
};

const contents = `// Auto-generated at start-up.\nwindow.__DEV_HEALTH_RUNTIME__ = ${JSON.stringify(
    payload,
)};\n`;

fs.writeFileSync(outputPath, contents, "utf8");

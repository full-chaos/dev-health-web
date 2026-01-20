const fs = require("node:fs");
const path = require("node:path");

const outputPath = path.join(process.cwd(), "public", "runtime-config.js");
const publicEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key, value]) => key.startsWith("NEXT_PUBLIC_") && value !== undefined
  )
);

if (
  publicEnv.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS === undefined &&
  process.env.USE_GRAPHQL_ANALYTICS !== undefined
) {
  publicEnv.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS =
    process.env.USE_GRAPHQL_ANALYTICS;
}

if (
  publicEnv.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === undefined &&
  process.env.DEV_HEALTH_TEST_MODE !== undefined
) {
  publicEnv.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE =
    process.env.DEV_HEALTH_TEST_MODE;
}

publicEnv.NEXT_PUBLIC_DOCS_URL =
  publicEnv.NEXT_PUBLIC_DOCS_URL || "/docs";

const payload = {
  publicEnv,
};

const contents = `// Auto-generated at start-up.\nwindow.__DEV_HEALTH_RUNTIME__ = ${JSON.stringify(
  payload
)};\n`;

fs.writeFileSync(outputPath, contents, "utf8");

import path from "node:path";
import { pathToFileURL } from "node:url";

export const NEXT_NO_REGISTRY_CHECK_URL = "https://registry.npmjs.org/-/package/next/dist-tags";

const preloadOption = `--import ${pathToFileURL(path.resolve(__dirname, "next-no-registry-check.mjs")).href}`;

/** NODE_OPTIONS for a `next dev` webServer: the existing value plus the registry-check guard. */
export function nextDevNodeOptions(
    existing: string | undefined = process.env.NODE_OPTIONS,
): string {
    const base = (existing ?? "").trim();
    if (base.includes(preloadOption)) return base;
    return base === "" ? preloadOption : `${base} ${preloadOption}`;
}

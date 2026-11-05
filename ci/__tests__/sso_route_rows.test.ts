import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { discoverRoutes } from "../discover_web_routes";

vi.setConfig({ testTimeout: 120_000 });

// CHAOS-13035 (web PR-2 of CHAOS-10878): the SSO routes exist at the exact paths the backend binds
// its cookies to (the ACS path rule), source discovery sees them, and each has its profile row.

const ROOT = resolve(__dirname, "../..");
const WANTED = [
    ["GET", "/auth/sso/oidc/[providerId]"],
    ["GET", "/auth/sso/saml/[providerId]"],
    ["GET", "/api/v1/auth/oidc/[providerId]/callback"],
    ["POST", "/api/v1/auth/saml/[providerId]/acs"],
] as const;

interface Row {
    id: string;
    method: string;
    route: string;
    classification: string;
    source: { file: string; line: number };
}
const rows = (
    JSON.parse(
        readFileSync(resolve(ROOT, "contracts/auth/v1/endpoint-profiles.web.json"), "utf8"),
    ) as { rows: Row[] }
).rows;

describe("web SSO routes and profile rows", () => {
    const found = discoverRoutes(ROOT);

    it.each(WANTED)("W-4 source discovery finds %s %s", (method, route) => {
        expect(found.some((r) => r.method === method && r.route === route)).toBe(true);
    });

    it("W-4 the SAML ACS is POST only and the OIDC callback GET only, at the exact paths", () => {
        const sso = found.filter((r) => /^\/api\/v1\/auth\/(oidc|saml)\//.test(r.route));
        expect(sso.map((r) => `${r.method} ${r.route}`).sort()).toEqual([
            "GET /api/v1/auth/oidc/[providerId]/callback",
            "POST /api/v1/auth/saml/[providerId]/acs",
        ]);
    });

    it.each(WANTED)("%s %s has a profile row anchored on its file", (method, route) => {
        const row = rows.find((r) => r.id === `${method} ${route} [dev-health-web]`);
        expect(row).toBeDefined();
        expect(row?.classification).toBe("public");
        const live = found.find((r) => r.method === method && r.route === route);
        expect(row?.source).toEqual({ file: live?.file, line: live?.line });
    });
});

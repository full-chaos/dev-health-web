import { afterEach, describe, expect, it, vi } from "vitest";

// The ACR grant-scope seam uses the same web authorize transport as the web decisions: with the
// workload token env complete it is a transport, with any value missing there is none (null), so a
// grant-based scope read refuses and never falls back to the catalog.
describe("ACR authorize transport seam", () => {
    const names = ["AUTH_INTERNAL_URL", "AUTH_WORKLOAD_SUBJECT_FILE", "AUTH_WORKLOAD_ISSUER"];
    const full = () => {
        vi.stubEnv("AUTH_INTERNAL_URL", "https://auth-internal.example.test:8097");
        vi.stubEnv("AUTH_WORKLOAD_SUBJECT_FILE", "/var/run/secrets/web/token");
        vi.stubEnv("AUTH_WORKLOAD_ISSUER", "https://auth.example.test");
    };
    const load = async () => {
        vi.resetModules();
        return import("../authorizeTransport");
    };
    afterEach(() => vi.unstubAllEnvs());

    it("is null with the env unset", async () => {
        for (const n of names) vi.stubEnv(n, "");
        expect((await load()).loadAuthorizeTransport()).toBeNull();
    });
    it.each(names)("is null when %s alone is missing", async (missing) => {
        full();
        vi.stubEnv(missing, "");
        expect((await load()).loadAuthorizeTransport()).toBeNull();
    });
    it("is a transport with the env complete", async () => {
        full();
        expect(typeof (await load()).loadAuthorizeTransport()).toBe("function");
    });
});

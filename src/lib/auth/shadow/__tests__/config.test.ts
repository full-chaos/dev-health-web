import { afterEach, describe, expect, it, vi } from "vitest";
import { shadowEnabled } from "../config";

describe("shadow switch", () => {
    it("is off when unset", () => {
        expect(shadowEnabled(undefined)).toBe(false);
    });
    it.each(["", "off", "ON", "On", "true", "1", " on", "on ", "yes"])("is off for %j", (v) => {
        expect(shadowEnabled(v)).toBe(false);
    });
    it("is on only for the exact value on", () => {
        expect(shadowEnabled("on")).toBe(true);
    });
});

describe("shadow transport seam", () => {
    const names = ["AUTH_INTERNAL_URL", "AUTH_WORKLOAD_SUBJECT_FILE", "AUTH_WORKLOAD_ISSUER"];
    const full = () => {
        vi.stubEnv("AUTH_INTERNAL_URL", "https://auth-internal.example.test:8097");
        vi.stubEnv("AUTH_WORKLOAD_SUBJECT_FILE", "/var/run/secrets/web/token");
        vi.stubEnv("AUTH_WORKLOAD_ISSUER", "https://auth.example.test");
    };
    const load = async () => {
        vi.resetModules();
        return import("../config");
    };
    afterEach(() => vi.unstubAllEnvs());
    it("is undefined with the env unset", async () => {
        for (const n of names) vi.stubEnv(n, "");
        expect((await load()).getShadowTransport()).toBeUndefined();
    });
    it.each(names)("is undefined when %s alone is missing", async (missing) => {
        full();
        vi.stubEnv(missing, "");
        expect((await load()).getShadowTransport()).toBeUndefined();
    });
    it("is a transport with the env complete", async () => {
        full();
        expect(typeof (await load()).getShadowTransport()).toBe("function");
    });
});

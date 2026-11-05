import { afterEach, describe, expect, it, vi } from "vitest";
import { DECIDE_TIMEOUT_MS, decideEnforced } from "../config";

describe("C3 the enforce switch", () => {
    it("is off when unset", () => {
        expect(decideEnforced(undefined)).toBe(false);
    });
    it.each(["", "off", "ON", "On", "true", "1", " on", "on ", "yes"])("is off for %j", (v) => {
        expect(decideEnforced(v)).toBe(false);
    });
    it("is on only for the exact value on", () => {
        expect(decideEnforced("on")).toBe(true);
    });
});

describe("decide settings", () => {
    it("has a 1500 ms bound", () => {
        expect(DECIDE_TIMEOUT_MS).toBe(1500);
    });
});

describe("decide transport seam", () => {
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
        expect((await load()).getDecideTransport()).toBeUndefined();
    });
    it.each(names)("is undefined when %s alone is missing", async (missing) => {
        full();
        vi.stubEnv(missing, "");
        expect((await load()).getDecideTransport()).toBeUndefined();
    });
    it("is a transport with the env complete", async () => {
        full();
        expect(typeof (await load()).getDecideTransport()).toBe("function");
    });
});

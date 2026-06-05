import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getServerEnv, publicEnv } from "../config";

type Snapshot = Record<string, string | undefined>;
const KEYS = [
    "NEXT_PUBLIC_DOCS_URL",
    "NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS",
    "NEXT_PUBLIC_DEV_HEALTH_TEST_MODE",
    "NEXT_PUBLIC_DEMO_MODE",
    "NEXT_PUBLIC_BETA",
    "NEXT_PUBLIC_RUM_ENDPOINT",
    "NEXT_PUBLIC_SENTRY_DSN",
    "BACKEND_URL",
    "LINEAR_API_KEY",
    "LINEAR_TEAM_ID",
    "USE_GRAPHQL_ANALYTICS",
    "DEV_HEALTH_TEST_MODE",
] as const;

const snapshot = (): Snapshot => Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

const restore = (snap: Snapshot) => {
    for (const [k, v] of Object.entries(snap)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
};

describe("config.publicEnv", () => {
    let snap: Snapshot;
    beforeEach(() => {
        snap = snapshot();
    });
    afterEach(() => restore(snap));

    it("applies the default for NEXT_PUBLIC_DOCS_URL when unset", () => {
        delete process.env.NEXT_PUBLIC_DOCS_URL;
        expect(publicEnv.NEXT_PUBLIC_DOCS_URL).toBe("/docs");
    });

    it("reflects a mutated value on subsequent access", () => {
        process.env.NEXT_PUBLIC_DOCS_URL = "https://docs.example.com";
        expect(publicEnv.NEXT_PUBLIC_DOCS_URL).toBe("https://docs.example.com");

        process.env.NEXT_PUBLIC_DOCS_URL = "/help";
        expect(publicEnv.NEXT_PUBLIC_DOCS_URL).toBe("/help");
    });

    it("returns undefined for optional fields when unset", () => {
        delete process.env.NEXT_PUBLIC_DEMO_MODE;
        expect(publicEnv.NEXT_PUBLIC_DEMO_MODE).toBeUndefined();
    });

    it("passes through enum-like string values verbatim", () => {
        process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS = "false";
        expect(publicEnv.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS).toBe("false");

        process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS = "true";
        expect(publicEnv.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS).toBe("true");
    });
});

describe("config.getServerEnv", () => {
    let snap: Snapshot;
    beforeEach(() => {
        snap = snapshot();
    });
    afterEach(() => restore(snap));

    it("parses a fresh snapshot on each call", () => {
        process.env.BACKEND_URL = "http://first.local";
        expect(getServerEnv().BACKEND_URL).toBe("http://first.local");

        process.env.BACKEND_URL = "http://second.local";
        expect(getServerEnv().BACKEND_URL).toBe("http://second.local");
    });

    it("returns undefined for optional vars that are unset", () => {
        delete process.env.LINEAR_API_KEY;
        delete process.env.LINEAR_TEAM_ID;
        const env = getServerEnv();
        expect(env.LINEAR_API_KEY).toBeUndefined();
        expect(env.LINEAR_TEAM_ID).toBeUndefined();
    });

    it("exposes server-only vars that publicEnv does not", () => {
        process.env.LINEAR_API_KEY = "key-xyz";
        process.env.LINEAR_TEAM_ID = "team-abc";
        const env = getServerEnv();
        expect(env.LINEAR_API_KEY).toBe("key-xyz");
        expect(env.LINEAR_TEAM_ID).toBe("team-abc");
    });

    it("throws when called from a genuine client bundle (window defined, not in Node test runner)", () => {
        // Simulate a non-test browser environment by hiding the VITEST flag.
        const originalWindow = (globalThis as { window?: unknown }).window;
        const env = process.env as Record<string, string | undefined>;
        const originalVitest = env.VITEST;
        const originalNodeEnv = env.NODE_ENV;

        (globalThis as { window?: unknown }).window = {};
        delete env.VITEST;
        delete env.NODE_ENV;

        try {
            expect(() => getServerEnv()).toThrow(/called from client bundle/);
        } finally {
            if (originalWindow === undefined) {
                delete (globalThis as { window?: unknown }).window;
            } else {
                (globalThis as { window?: unknown }).window = originalWindow;
            }
            if (originalVitest !== undefined) env.VITEST = originalVitest;
            if (originalNodeEnv !== undefined) env.NODE_ENV = originalNodeEnv;
        }
    });
});

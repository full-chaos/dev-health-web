import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: module mocks must read from a value declared above the
// hoisted vi.mock calls. This lets each test flip isBrowser / BACKEND_URL.
const mocks = vi.hoisted(() => ({
    isBrowser: false,
    serverEnv: {} as { BACKEND_URL?: string },
}));

vi.mock("@/lib/env", () => ({
    get isBrowser() {
        return mocks.isBrowser;
    },
    get isServer() {
        return !mocks.isBrowser;
    },
}));

vi.mock("@/lib/config", () => ({
    getServerEnv: () => mocks.serverEnv,
}));

import { getBackendUrl, resolveOrigin } from "@/lib/origin";

const DEFAULT_BACKEND = "http://127.0.0.1:8000";

describe("resolveOrigin", () => {
    beforeEach(() => {
        mocks.isBrowser = false;
        mocks.serverEnv = {};
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe("server environment", () => {
        it("returns BACKEND_URL from getServerEnv when set", () => {
            mocks.serverEnv = { BACKEND_URL: "https://api.production.example.com" };
            expect(resolveOrigin()).toBe("https://api.production.example.com");
        });

        it("returns the default backend URL when BACKEND_URL is undefined", () => {
            mocks.serverEnv = {};
            expect(resolveOrigin()).toBe(DEFAULT_BACKEND);
        });

        it("preserves a backend URL with a custom port", () => {
            mocks.serverEnv = { BACKEND_URL: "http://backend.internal:9090" };
            expect(resolveOrigin()).toBe("http://backend.internal:9090");
        });

        it("returns an empty BACKEND_URL as-is (?? does not treat '' as missing)", () => {
            mocks.serverEnv = { BACKEND_URL: "" };
            expect(resolveOrigin()).toBe("");
        });
    });

    describe("browser environment", () => {
        it("returns window.location.origin when isBrowser is true", () => {
            mocks.isBrowser = true;
            vi.stubGlobal("window", {
                location: { origin: "https://app.example.com" },
            });
            expect(resolveOrigin()).toBe("https://app.example.com");
        });

        it("prefers window.location.origin over BACKEND_URL when in a browser", () => {
            mocks.isBrowser = true;
            mocks.serverEnv = { BACKEND_URL: "https://ignored-backend.example" };
            vi.stubGlobal("window", {
                location: { origin: "https://browser.example.com" },
            });
            expect(resolveOrigin()).toBe("https://browser.example.com");
        });

        it("handles browser origins with a port", () => {
            mocks.isBrowser = true;
            vi.stubGlobal("window", {
                location: { origin: "http://localhost:3000" },
            });
            expect(resolveOrigin()).toBe("http://localhost:3000");
        });
    });
});

describe("getBackendUrl", () => {
    beforeEach(() => {
        mocks.isBrowser = false;
        mocks.serverEnv = {};
    });

    it("returns the BACKEND_URL from server env when set", () => {
        mocks.serverEnv = { BACKEND_URL: "https://backend.example.com" };
        expect(getBackendUrl()).toBe("https://backend.example.com");
    });

    it("returns the default backend URL when BACKEND_URL is undefined", () => {
        mocks.serverEnv = {};
        expect(getBackendUrl()).toBe(DEFAULT_BACKEND);
    });

    it("ignores the browser/window context (always reads server env)", () => {
        mocks.isBrowser = true;
        mocks.serverEnv = { BACKEND_URL: "http://backend-only.example" };
        vi.stubGlobal("window", {
            location: { origin: "https://ignored.example" },
        });
        expect(getBackendUrl()).toBe("http://backend-only.example");
    });

    it("reflects BACKEND_URL changes between successive calls", () => {
        mocks.serverEnv = { BACKEND_URL: "http://first.example" };
        expect(getBackendUrl()).toBe("http://first.example");
        mocks.serverEnv = { BACKEND_URL: "http://second.example" };
        expect(getBackendUrl()).toBe("http://second.example");
    });

    it("returns an empty BACKEND_URL as-is (?? does not treat '' as missing)", () => {
        mocks.serverEnv = { BACKEND_URL: "" };
        expect(getBackendUrl()).toBe("");
    });
});

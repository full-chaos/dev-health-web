import { describe, expect, it, afterEach, vi } from "vitest";
import { runtimeConfig } from "../runtimeConfig";

type RuntimeWindow = Window & {
    __DEV_HEALTH_RUNTIME__?: {
        publicEnv: {
            NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS?: string;
            NEXT_PUBLIC_DOCS_URL?: string;
        };
    };
};

const mockWindow = (overrides?: Partial<RuntimeWindow>) => {
    if (overrides === undefined) {
        vi.stubGlobal("window", undefined);
        return;
    }

    vi.stubGlobal("window", {
        ...overrides,
    } as RuntimeWindow);
};

const captureEnv = () => ({
    NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS: process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS,
    NEXT_PUBLIC_DOCS_URL: process.env.NEXT_PUBLIC_DOCS_URL,
    USE_GRAPHQL_ANALYTICS: process.env.USE_GRAPHQL_ANALYTICS,
});

const restoreEnv = (snapshot: ReturnType<typeof captureEnv>) => {
    for (const [key, value] of Object.entries(snapshot)) {
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("runtimeConfig", () => {
    it("prefers runtime config when available", () => {
        const originalEnv = captureEnv();
        process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS = "false";
        process.env.NEXT_PUBLIC_DOCS_URL = "/docs";

        mockWindow({
            __DEV_HEALTH_RUNTIME__: {
                publicEnv: {
                    NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS: "true",
                    NEXT_PUBLIC_DOCS_URL: "https://docs.example.com",
                },
            },
        });

        try {
            expect(runtimeConfig.useGraphQLAnalytics()).toBe(true);
            expect(runtimeConfig.docsUrl()).toBe("https://docs.example.com");
        } finally {
            restoreEnv(originalEnv);
        }
    });

    it("falls back to env values when runtime config is absent", () => {
        const originalEnv = captureEnv();
        mockWindow();
        process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS = "true";
        process.env.NEXT_PUBLIC_DOCS_URL = "https://docs.local";

        try {
            expect(runtimeConfig.useGraphQLAnalytics()).toBe(true);
            expect(runtimeConfig.docsUrl()).toBe("https://docs.local");
        } finally {
            restoreEnv(originalEnv);
        }
    });

    it("allows server runtime override for GraphQL", () => {
        const originalEnv = captureEnv();
        mockWindow();
        process.env.USE_GRAPHQL_ANALYTICS = "true";
        delete process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS;

        try {
            expect(runtimeConfig.useGraphQLAnalytics()).toBe(true);
        } finally {
            restoreEnv(originalEnv);
        }
    });
});

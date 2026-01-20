import { describe, expect, it, afterEach } from "vitest";
import { runtimeConfig } from "../runtimeConfig";

const globalWithWindow = globalThis as typeof globalThis & {
  window?: Window;
};

const originalWindow = globalWithWindow.window;

const restoreWindow = () => {
  if (originalWindow === undefined) {
    delete globalWithWindow.window;
  } else {
    globalWithWindow.window = originalWindow;
  }
};

const captureEnv = () => ({
  NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS: process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS,
  NEXT_PUBLIC_DEV_HEALTH_TEST_MODE: process.env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE,
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
  restoreWindow();
});

describe("runtimeConfig", () => {
  it("prefers runtime config when available", () => {
    const originalEnv = captureEnv();
    process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS = "false";
    process.env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE = "false";
    process.env.NEXT_PUBLIC_DOCS_URL = "/docs";

    globalWithWindow.window = {
      __DEV_HEALTH_RUNTIME__: {
        publicEnv: {
          NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS: "true",
          NEXT_PUBLIC_DEV_HEALTH_TEST_MODE: "true",
          NEXT_PUBLIC_DOCS_URL: "https://docs.example.com",
        },
      },
    } as unknown as Window;

    try {
      expect(runtimeConfig.useGraphQLAnalytics()).toBe(true);
      expect(runtimeConfig.devHealthTestMode()).toBe(true);
      expect(runtimeConfig.docsUrl()).toBe("https://docs.example.com");
    } finally {
      restoreEnv(originalEnv);
    }
  });

  it("falls back to env values when runtime config is absent", () => {
    const originalEnv = captureEnv();
    delete globalWithWindow.window;
    process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS = "true";
    process.env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE = "true";
    process.env.NEXT_PUBLIC_DOCS_URL = "https://docs.local";

    try {
      expect(runtimeConfig.useGraphQLAnalytics()).toBe(true);
      expect(runtimeConfig.devHealthTestMode()).toBe(true);
      expect(runtimeConfig.docsUrl()).toBe("https://docs.local");
    } finally {
      restoreEnv(originalEnv);
    }
  });

  it("allows server runtime override for GraphQL", () => {
    const originalEnv = captureEnv();
    delete globalWithWindow.window;
    process.env.USE_GRAPHQL_ANALYTICS = "true";
    delete process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS;

    try {
      expect(runtimeConfig.useGraphQLAnalytics()).toBe(true);
    } finally {
      restoreEnv(originalEnv);
    }
  });
});

type RuntimeConfig = {
  publicEnv?: Record<string, string>;
};

const readRuntimeConfig = (): RuntimeConfig | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.__DEV_HEALTH_RUNTIME__;
};

const getPublicEnvValue = (key: string): string | undefined => {
  const runtime = readRuntimeConfig();
  const runtimeValue = runtime?.publicEnv?.[key];
  if (runtimeValue !== undefined) {
    return runtimeValue;
  }
  return process.env[key];
};

const getPublicBoolean = (key: string): boolean =>
  getPublicEnvValue(key) === "true";

export const runtimeConfig = {
  useGraphQLAnalytics: (): boolean => {
    if (typeof window !== "undefined") {
      return getPublicBoolean("NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS");
    }
    const raw =
      process.env.USE_GRAPHQL_ANALYTICS ??
      getPublicEnvValue("NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS");
    return raw === "true";
  },
  devHealthTestMode: (): boolean =>
    getPublicBoolean("NEXT_PUBLIC_DEV_HEALTH_TEST_MODE"),
  docsUrl: (): string =>
    getPublicEnvValue("NEXT_PUBLIC_DOCS_URL") || "/docs",
};

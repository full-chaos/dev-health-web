export {};

declare global {
  interface Window {
    __DEV_HEALTH_RUNTIME__?: {
      publicEnv?: Record<string, string>;
    };
  }
}

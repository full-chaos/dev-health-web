import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import {
  chartColors,
  fallbackTheme,
  listeners,
  getCleanupFn,
  subscribeToTheme,
  getThemeSnapshot,
  getColorsSnapshot,
  getServerTheme,
  getServerColors,
  resetForTesting,
} from "@/components/charts/chartTheme";

// Note: These tests run in Node environment (not jsdom), so window is undefined
// and observers won't be set up. We test the subscription logic without observers.
const isNodeEnv = typeof window === "undefined";

describe("chartTheme shared observer", () => {
  beforeEach(() => {
    // Reset module state before each test
    resetForTesting();
  });

  afterEach(() => {
    // Clean up after each test
    resetForTesting();
  });

  describe("server-side rendering fallbacks", () => {
    it("returns fallback theme for SSR via getServerTheme", () => {
      const theme = getServerTheme();
      expect(theme).toEqual(fallbackTheme);
    });

    it("returns fallback colors for SSR via getServerColors", () => {
      const colors = getServerColors();
      expect(colors).toEqual(chartColors);
    });
  });

  describe("subscription management", () => {
    it("adds listener when subscribing", () => {
      const listener = vi.fn();
      expect(listeners.size).toBe(0);

      subscribeToTheme(listener);

      expect(listeners.size).toBe(1);
      expect(listeners.has(listener)).toBe(true);
    });

    it("removes listener when unsubscribing", () => {
      const listener = vi.fn();
      const unsubscribe = subscribeToTheme(listener);

      expect(listeners.size).toBe(1);

      unsubscribe();

      expect(listeners.size).toBe(0);
      expect(listeners.has(listener)).toBe(false);
    });

    it("multiple listeners share the same subscription store", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      subscribeToTheme(listener1);
      subscribeToTheme(listener2);
      subscribeToTheme(listener3);

      expect(listeners.size).toBe(3);
      expect(listeners.has(listener1)).toBe(true);
      expect(listeners.has(listener2)).toBe(true);
      expect(listeners.has(listener3)).toBe(true);
    });

    it("unsubscribing one listener does not affect others", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      subscribeToTheme(listener1);
      const unsubscribe2 = subscribeToTheme(listener2);

      expect(listeners.size).toBe(2);

      unsubscribe2();

      expect(listeners.size).toBe(1);
      expect(listeners.has(listener1)).toBe(true);
      expect(listeners.has(listener2)).toBe(false);
    });
  });

  describe("observer lifecycle in server/node environment", () => {
    it("does not set up observers when window is undefined (SSR/Node)", () => {
      const listener = vi.fn();
      subscribeToTheme(listener);

      // In node environment, setupObservers returns early without setting cleanupFn
      if (isNodeEnv) {
        expect(getCleanupFn()).toBeNull();
      }
    });

    it("teardownObservers is safe to call without observers", () => {
      const listener = vi.fn();
      const unsubscribe = subscribeToTheme(listener);

      // Should not throw even without observers set up
      expect(() => {
        unsubscribe();
      }).not.toThrow();

      expect(listeners.size).toBe(0);
    });

    it("teardownObservers only acts when listeners are empty", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      subscribeToTheme(listener1);
      const unsubscribe2 = subscribeToTheme(listener2);

      // With a listener still active, teardown should not error
      expect(() => {
        unsubscribe2();
      }).not.toThrow();

      expect(listeners.size).toBe(1);
    });
  });

  describe("snapshot functions", () => {
    it("getThemeSnapshot returns current theme", () => {
      const theme = getThemeSnapshot();
      expect(theme).toBeDefined();
      expect(theme).toHaveProperty("text");
      expect(theme).toHaveProperty("grid");
      expect(theme).toHaveProperty("muted");
      expect(theme).toHaveProperty("background");
      expect(theme).toHaveProperty("stroke");
      expect(theme).toHaveProperty("accent1");
      expect(theme).toHaveProperty("accent2");
    });

    it("getColorsSnapshot returns current colors array", () => {
      const colors = getColorsSnapshot();
      expect(Array.isArray(colors)).toBe(true);
      expect(colors.length).toBe(chartColors.length);
    });

    it("snapshots return fallback values in server environment", () => {
      // In node env, the store is initialized with fallbacks
      const theme = getThemeSnapshot();
      const colors = getColorsSnapshot();

      expect(theme).toEqual(fallbackTheme);
      expect(colors).toEqual(chartColors);
    });
  });

  describe("subscription reuse behavior", () => {
    it("multiple subscriptions maintain correct listener count", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      subscribeToTheme(listener1);
      subscribeToTheme(listener2);

      // Both listeners should be tracked
      expect(listeners.size).toBe(2);
    });

    it("unsubscribe/resubscribe cycle manages listeners correctly", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const unsubscribe1 = subscribeToTheme(listener1);
      expect(listeners.size).toBe(1);

      // Unsubscribe
      unsubscribe1();
      expect(listeners.size).toBe(0);

      // Resubscribe with different listener
      subscribeToTheme(listener2);
      expect(listeners.size).toBe(1);
      expect(listeners.has(listener2)).toBe(true);
      expect(listeners.has(listener1)).toBe(false);
    });

    it("same listener can be added multiple times", () => {
      const listener = vi.fn();

      subscribeToTheme(listener);
      subscribeToTheme(listener);

      // Set only stores unique values, so size should still be 1
      expect(listeners.size).toBe(1);
    });
  });
});

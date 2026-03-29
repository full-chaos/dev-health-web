import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, userEvent } from "@/test/utils";
import { PreferencesSettings } from "./PreferencesSettings";

describe("PreferencesSettings", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    };

    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: storage,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: storage,
    });

    storage.clear();
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.palette = "fullchaos";
    document.documentElement.style.colorScheme = "dark";
  });

  it("shows the infinity knot palette in admin preferences", () => {
    render(<PreferencesSettings />);

    expect(
      screen.getByRole("button", { name: "Infinity Knot" })
    ).toBeInTheDocument();
  });

  it("applies the infinity knot palette from admin preferences", async () => {
    const user = userEvent.setup();
    render(<PreferencesSettings />);

    await user.click(screen.getByRole("button", { name: "Infinity Knot" }));

    expect(document.documentElement.dataset.palette).toBe("fullchaos-infinity-knot");
    expect(localStorage.getItem("palette")).toBe("fullchaos-infinity-knot");
  });
});

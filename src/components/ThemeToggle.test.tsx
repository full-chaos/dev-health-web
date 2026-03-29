import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, userEvent } from "@/test/utils";
import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
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

  it("renders the infinity knot palette option when expanded", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: /expand settings/i }));

    expect(
      screen.getByRole("option", { name: "Fullchaos Infinity Knot" })
    ).toBeInTheDocument();
  });

  it("persists the infinity knot palette selection", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: /expand settings/i }));
    await user.selectOptions(
      screen.getByLabelText(/theme palette/i),
      "fullchaos-infinity-knot"
    );

    expect(document.documentElement.dataset.palette).toBe("fullchaos-infinity-knot");
    expect(localStorage.getItem("palette")).toBe("fullchaos-infinity-knot");
  });
});

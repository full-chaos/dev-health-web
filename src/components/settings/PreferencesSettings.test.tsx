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
        document.documentElement.dataset.palette = "infinity";
        document.documentElement.style.colorScheme = "dark";
    });

    it("offers no palette chooser", () => {
        render(<PreferencesSettings />);

        expect(screen.queryByText("Color Palette")).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Infinity Knot Redux" }),
        ).not.toBeInTheDocument();
    });

    it("persists the product telemetry opt-out preference", async () => {
        const user = userEvent.setup();
        render(<PreferencesSettings />);

        await user.click(screen.getByRole("button", { name: "Disabled" }));

        expect(localStorage.getItem("devhealth-product-telemetry-opt-out")).toBe("true");
        expect(screen.getByRole("button", { name: "Disabled" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );

        await user.click(screen.getByRole("button", { name: "Enabled" }));

        expect(localStorage.getItem("devhealth-product-telemetry-opt-out")).toBe("false");
        expect(screen.getByRole("button", { name: "Enabled" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
    });
});

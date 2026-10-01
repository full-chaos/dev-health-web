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
        document.documentElement.dataset.palette = "infinity";
        document.documentElement.style.colorScheme = "dark";
    });

    it("offers no palette chooser", async () => {
        const user = userEvent.setup();
        render(<ThemeToggle />);

        await user.click(screen.getByRole("button", { name: /expand settings/i }));

        expect(screen.queryByLabelText(/theme palette/i)).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /toggle light\/dark/i })).toBeInTheDocument();
    });

    it("toggles the theme and leaves the palette on infinity", async () => {
        const user = userEvent.setup();
        render(<ThemeToggle />);

        await user.click(screen.getByRole("button", { name: /expand settings/i }));
        await user.click(screen.getByRole("button", { name: /toggle light\/dark/i }));

        expect(document.documentElement.dataset.theme).toBe("light");
        expect(document.documentElement.dataset.palette).toBe("infinity");
    });
});

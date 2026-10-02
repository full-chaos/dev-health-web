import { readFileSync } from "node:fs";
import { join } from "node:path";
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

    const toLight = () => screen.getByRole("button", { name: "Switch to light theme" });
    const toDark = () => screen.getByRole("button", { name: "Switch to dark theme" });

    it("defaults to dark: a sun icon button, no text, labelled with the next theme", () => {
        render(<ThemeToggle />);
        const toggle = toLight();
        expect(toggle).toHaveAttribute("data-theme-current", "dark");
        expect(toggle).not.toHaveAttribute("aria-pressed");
        expect(toggle.textContent).toBe("");
        expect(toggle.querySelector("svg.lucide-sun")).not.toBeNull();
        expect(toggle.className).toMatch(/\brounded-md\b/);
        expect(toggle.className).toMatch(/\bw-9\b/);
    });

    it("falls back to dark, not the system theme, when nothing is stored or set", () => {
        delete document.documentElement.dataset.theme;
        render(<ThemeToggle />);
        expect(toLight()).toHaveAttribute("data-theme-current", "dark");
    });

    it("toggles to light, persists, shows the moon and keeps the palette on infinity", async () => {
        const user = userEvent.setup();
        render(<ThemeToggle />);

        await user.click(toLight());

        expect(document.documentElement.dataset.theme).toBe("light");
        expect(document.documentElement.dataset.palette).toBe("infinity");
        expect(localStorage.getItem("theme")).toBe("light");
        expect(toDark().querySelector("svg.lucide-moon")).not.toBeNull();
    });

    it("toggles back to dark and is keyboard operable", async () => {
        const user = userEvent.setup();
        render(<ThemeToggle />);
        toLight().focus();
        await user.keyboard("{Enter}");
        expect(document.documentElement.dataset.theme).toBe("light");
        await user.keyboard(" ");
        expect(document.documentElement.dataset.theme).toBe("dark");
        expect(localStorage.getItem("theme")).toBe("dark");
        expect(toLight()).toBeInTheDocument();
    });

    it("applies a stored light preference on mount", () => {
        localStorage.setItem("theme", "light");
        render(<ThemeToggle />);
        expect(document.documentElement.dataset.theme).toBe("light");
        expect(toDark()).toHaveAttribute("data-theme-current", "light");
    });

    it("theme-init.js sets the stored theme before paint and leaves dark otherwise", () => {
        const src = readFileSync(join(process.cwd(), "public/theme-init.js"), "utf8");
        document.documentElement.dataset.theme = "dark";

        new Function(src)();
        expect(document.documentElement.dataset.theme).toBe("dark");

        localStorage.setItem("theme", "light");

        new Function(src)();
        expect(document.documentElement.dataset.theme).toBe("light");
        expect(document.documentElement.style.colorScheme).toBe("light");
    });

    it("is mounted in the legacy account bar and in the app layout shell slot", () => {
        const root = join(process.cwd(), "src");
        expect(readFileSync(join(root, "components/shell/LegacyAccountBar.tsx"), "utf8")).toMatch(
            /<ThemeToggle \/>/,
        );
        expect(readFileSync(join(root, "app/(app)/layout.tsx"), "utf8")).toMatch(
            /themeToggle=\{<ThemeToggle \/>\}/,
        );
    });
});

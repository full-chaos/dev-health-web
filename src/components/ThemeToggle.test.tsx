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

    it("defaults to dark with the switch not pressed", () => {
        render(<ThemeToggle />);
        const toggle = screen.getByRole("button", { name: /light theme/i });
        expect(toggle).toHaveAttribute("aria-pressed", "false");
        expect(toggle).toHaveTextContent("Dark");
    });

    it("falls back to dark, not the system theme, when nothing is stored or set", () => {
        delete document.documentElement.dataset.theme;
        render(<ThemeToggle />);
        expect(screen.getByRole("button", { name: /light theme/i })).toHaveAttribute(
            "aria-pressed",
            "false",
        );
    });

    it("toggles to light, persists, and keeps the palette on infinity", async () => {
        const user = userEvent.setup();
        render(<ThemeToggle />);

        await user.click(screen.getByRole("button", { name: /light theme/i }));

        expect(document.documentElement.dataset.theme).toBe("light");
        expect(document.documentElement.dataset.palette).toBe("infinity");
        expect(localStorage.getItem("theme")).toBe("light");
        expect(screen.getByRole("button", { name: /light theme/i })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
    });

    it("toggles back to dark and is keyboard operable", async () => {
        const user = userEvent.setup();
        render(<ThemeToggle />);
        const toggle = screen.getByRole("button", { name: /light theme/i });
        toggle.focus();
        await user.keyboard("{Enter}");
        expect(document.documentElement.dataset.theme).toBe("light");
        await user.keyboard(" ");
        expect(document.documentElement.dataset.theme).toBe("dark");
        expect(localStorage.getItem("theme")).toBe("dark");
    });

    it("applies a stored light preference on mount", () => {
        localStorage.setItem("theme", "light");
        render(<ThemeToggle />);
        expect(document.documentElement.dataset.theme).toBe("light");
        expect(screen.getByRole("button", { name: /light theme/i })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
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

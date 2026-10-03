import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PreferencesSettings } from "@/components/settings/PreferencesSettings";
import { ThemeToggle } from "@/components/ThemeToggle";
import { render, screen, userEvent } from "@/test/utils";

// The four cases of CHAOS-8244 (the "System" theme): nothing stored; a stored light or dark; a stored
// "system" resolved before first paint; a stored "system" followed live.

type Listener = (event: { matches: boolean }) => void;
const os = { dark: false, listeners: new Set<Listener>() };

function installMatchMedia() {
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: (query: string) => ({
            get matches() {
                return query.includes("dark") ? os.dark : false;
            },
            media: query,
            addEventListener: (_: string, listener: Listener) => os.listeners.add(listener),
            removeEventListener: (_: string, listener: Listener) => os.listeners.delete(listener),
        }),
    });
}

function installStorage() {
    const store = new Map<string, string>();
    const storage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
        clear: () => store.clear(),
    };
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
    return storage;
}

const initScript = readFileSync(join(process.cwd(), "public/theme-init.js"), "utf8");
const runInit = () => new Function(initScript)();
const root = () => document.documentElement;

beforeEach(() => {
    installStorage();
    installMatchMedia();
    os.dark = false;
    os.listeners.clear();
    root().dataset.theme = "dark";
    root().style.colorScheme = "dark";
});

afterEach(() => vi.restoreAllMocks());

describe("theme preference: nothing stored", () => {
    it("keeps the default (dark) even when the operating system is light, before and after mount", () => {
        os.dark = false;
        runInit();
        expect(root().dataset.theme).toBe("dark");
        render(<ThemeToggle />);
        expect(screen.getByTestId("theme-toggle")).toHaveAttribute("data-theme-current", "dark");
        expect(localStorage.getItem("theme")).toBeNull();
    });
});

describe("theme preference: a stored light or dark", () => {
    it.each(["light", "dark"] as const)(
        "%s is applied by the init script and by the toggle",
        (theme) => {
            os.dark = theme === "light"; // the operating system disagrees: the stored choice wins
            localStorage.setItem("theme", theme);
            runInit();
            expect(root().dataset.theme).toBe(theme);
            render(<ThemeToggle />);
            expect(screen.getByTestId("theme-toggle")).toHaveAttribute("data-theme-current", theme);
        },
    );
});

describe("theme preference: a stored system, before first paint", () => {
    it.each([
        [true, "dark"],
        [false, "light"],
    ] as const)(
        "the init script draws the operating system's theme (dark=%s)",
        (dark, expected) => {
            os.dark = dark;
            localStorage.setItem("theme", "system");
            runInit();
            expect(root().dataset.theme).toBe(expected);
            expect(root().style.colorScheme).toBe(expected);
        },
    );
});

describe("theme preference: a stored system, followed live", () => {
    it("the toggle follows an operating-system change without a reload, and keeps 'system' stored", () => {
        os.dark = false;
        localStorage.setItem("theme", "system");
        render(<ThemeToggle />);
        expect(root().dataset.theme).toBe("light");
        act(() => {
            os.dark = true;
            os.listeners.forEach((listener) => listener({ matches: true }));
        });
        expect(root().dataset.theme).toBe("dark");
        expect(screen.getByTestId("theme-toggle")).toHaveAttribute("data-theme-current", "dark");
        expect(localStorage.getItem("theme")).toBe("system");
    });

    it("a click on the toggle leaves system mode: it stores an explicit theme", async () => {
        os.dark = true;
        localStorage.setItem("theme", "system");
        const user = userEvent.setup();
        render(<ThemeToggle />);
        await user.click(screen.getByTestId("theme-toggle"));
        expect(localStorage.getItem("theme")).toBe("light");
        act(() => {
            os.dark = false;
            os.listeners.forEach((listener) => listener({ matches: false }));
        });
        expect(root().dataset.theme).toBe("light");
        expect(localStorage.getItem("theme")).toBe("light");
    });
});

describe("Settings: the System option", () => {
    it("offers Light, Dark and System, stores 'system', and shares the setting with the top-bar toggle", async () => {
        os.dark = true;
        const user = userEvent.setup();
        render(
            <>
                <ThemeToggle />
                <PreferencesSettings />
            </>,
        );
        expect(screen.getByRole("button", { name: /Light/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Dark/ })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: /System/ }));
        expect(localStorage.getItem("theme")).toBe("system");
        expect(screen.getByRole("button", { name: /System/ })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        expect(root().dataset.theme).toBe("dark");
        expect(
            screen.getByText("The theme switch in the top bar changes the same setting."),
        ).toBeInTheDocument();

        // The same setting: a click on the top-bar toggle changes what Settings shows.
        await user.click(screen.getByTestId("theme-toggle"));
        expect(screen.getByRole("button", { name: /Light/ })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        expect(screen.getByRole("button", { name: /System/ })).toHaveAttribute(
            "aria-pressed",
            "false",
        );
    });
});

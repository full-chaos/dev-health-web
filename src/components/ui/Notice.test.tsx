import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";

import { Notice } from "./Notice";

describe("Notice", () => {
    it.each([
        ["info", "Information"],
        ["warn", "Warning"],
        ["good", "OK"],
        ["danger", "Error"],
    ] as const)(
        "%s variant carries an icon and a text label, not color alone",
        (variant, label) => {
            const { container } = render(
                <Notice variant={variant} title="Heads up">
                    Body copy
                </Notice>,
            );
            expect(container.querySelector("svg[aria-hidden='true']")).not.toBeNull();
            expect(screen.getByText(`${label}:`, { exact: false })).toHaveClass("sr-only");
            expect(screen.getByText("Heads up")).toBeInTheDocument();
            expect(screen.getByText("Body copy")).toBeInTheDocument();
            expect(container.firstChild).toHaveAttribute("data-notice-variant", variant);
        },
    );

    it("uses a polite status live region by default", () => {
        render(<Notice variant="warn">x</Notice>);
        const el = screen.getByRole("status");
        expect(el).toHaveAttribute("aria-live", "polite");
    });

    it("has no live region when live is false", () => {
        render(<Notice live={false}>x</Notice>);
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("renders the action and calls onDismiss", async () => {
        const onDismiss = vi.fn();
        render(
            <Notice action={<a href="/go">Go</a>} onDismiss={onDismiss}>
                x
            </Notice>,
        );
        expect(screen.getByRole("link", { name: "Go" })).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("renders no dismiss button without onDismiss", () => {
        render(<Notice>x</Notice>);
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("renders the title as a heading when titleAs is set", () => {
        render(
            <Notice title="T" titleAs="h2">
                x
            </Notice>,
        );
        expect(screen.getByRole("heading", { level: 2, name: "T" })).toBeInTheDocument();
    });

    it("strong warn fills solid amber with black ink, as production did, through the theme tokens", () => {
        const { container } = render(
            <Notice variant="warn" emphasis="strong" live={false}>
                x
            </Notice>,
        );
        expect(container.firstChild).toHaveClass(
            "bg-(--caution-solid)",
            "text-(--on-caution-solid)",
        );
    });
});

describe("Notice centered", () => {
    it("pins the dismiss button to the far right", () => {
        render(
            <Notice centered onDismiss={() => {}}>
                x
            </Notice>,
        );
        expect(screen.getByRole("button", { name: "Dismiss" })).toHaveClass("absolute", "right-4");
    });
});

const channels = (hex: string) =>
    [1, 3, 5].map((i) => {
        const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
const luminance = (hex: string) => {
    const [r, g, b] = channels(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

describe("Notice strong contrast", () => {
    it("black on amber-500 passes 4.5:1 (the pair is theme independent)", () => {
        expect(contrast("#000000", "#f59e0b")).toBeGreaterThanOrEqual(4.5);
    });
    it("the light caution token as a fill under black ink fails, so it is not used", () => {
        expect(contrast("#000000", "#8a5700")).toBeLessThan(4.5);
    });
});

describe("Notice danger", () => {
    it("is an alert region by default, not a polite status", () => {
        render(<Notice variant="danger">Could not save</Notice>);
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("has no live region when live is false", () => {
        render(
            <Notice variant="danger" live={false}>
                x
            </Notice>,
        );
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("differs from warn by icon, not only by color", () => {
        const glyph = (el: HTMLElement) =>
            (el.querySelector("svg")?.getAttribute("class") ?? "")
                .split(" ")
                .find((c) => c.startsWith("lucide-") && c !== "lucide");
        const { container: a } = render(<Notice variant="warn">x</Notice>);
        const { container: b } = render(<Notice variant="danger">x</Notice>);
        expect(glyph(a)).toBeTruthy();
        expect(glyph(a)).not.toBe(glyph(b));
    });

    it("keeps its icon visible next to the screen-reader label, and ignores strong emphasis", () => {
        const { container } = render(
            <Notice variant="danger" emphasis="strong">
                x
            </Notice>,
        );
        expect(container.querySelector("svg[aria-hidden='true']")).not.toBeNull();
        expect(container.firstChild).not.toHaveClass("bg-amber-500");
    });

    it("title and body ink pass 4.5:1 on the 8% negative tint (measured pairs)", () => {
        const mix = (a: string, b: string, p: number) =>
            "#" +
            [1, 3, 5]
                .map((i) =>
                    Math.round(
                        Number.parseInt(a.slice(i, i + 2), 16) * p +
                            Number.parseInt(b.slice(i, i + 2), 16) * (1 - p),
                    )
                        .toString(16)
                        .padStart(2, "0"),
                )
                .join("");
        for (const [neg, card, ink] of [
            ["#a61708", "#fdfdfc", "#656c73"],
            ["#ff8266", "#161c20", "#a7afb5"],
        ]) {
            const fill = mix(neg, card, 0.08);
            expect(contrast(neg, fill)).toBeGreaterThanOrEqual(4.5);
            expect(contrast(ink, fill)).toBeGreaterThanOrEqual(4.5);
        }
    });
});

describe("Notice has a wash and no coloured border (prototype .notice)", () => {
    it.each(["info", "warn", "good", "danger"] as const)(
        "%s draws a transparent border",
        (variant) => {
            render(<Notice variant={variant}>x</Notice>);
            const el = screen.getByRole(variant === "danger" ? "alert" : "status");
            expect(el).toHaveClass("border-transparent");
            expect(el.className).not.toMatch(/border-\[color-mix/u);
        },
    );
});

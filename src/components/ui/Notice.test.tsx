import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";

import { Notice } from "./Notice";

describe("Notice", () => {
    it.each([
        ["info", "Information"],
        ["warn", "Warning"],
        ["good", "OK"],
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

    it("strong emphasis fills solid with the variant color", () => {
        const { container } = render(
            <Notice variant="warn" emphasis="strong" live={false}>
                x
            </Notice>,
        );
        expect(container.firstChild).toHaveClass("bg-(--caution)");
    });
});

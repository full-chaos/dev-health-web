import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";

import { AdminErrorNotice } from "./AdminErrorNotice";

const variantOf = (el: HTMLElement) =>
    el.closest("[data-notice-variant]")?.getAttribute("data-notice-variant");

describe("AdminErrorNotice", () => {
    it("a load failure is one plain sentence with Retry; the served text is not printed", async () => {
        const retry = vi.fn();
        const { container } = render(
            <AdminErrorNotice
                error="GET /x 502"
                kind="load"
                subject="Rules"
                onRetryAction={retry}
            />,
        );

        expect(screen.getByText(/^Rules could not be loaded\. Retry/u)).toBeInTheDocument();
        expect(container.textContent).not.toContain("502");
        await userEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(retry).toHaveBeenCalledTimes(1);
    });

    it("an action failure keeps the served message, in a danger notice without Retry", () => {
        render(
            <AdminErrorNotice
                error="Rule overlaps"
                kind="action"
                subject="Rules"
                onRetryAction={vi.fn()}
            />,
        );

        expect(variantOf(screen.getByText("Rule overlaps"))).toBe("danger");
        expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    });

    it("a plan-gate sentence is a warning for both kinds", () => {
        const gate = "This feature requires the enterprise plan (current plan: community).";
        const { rerender } = render(
            <AdminErrorNotice error={gate} kind="load" subject="Rules" onRetryAction={vi.fn()} />,
        );
        expect(variantOf(screen.getByText(gate))).toBe("warn");

        rerender(
            <AdminErrorNotice error={gate} kind="action" subject="Rules" onRetryAction={vi.fn()} />,
        );
        expect(variantOf(screen.getByText(gate))).toBe("warn");
    });
});

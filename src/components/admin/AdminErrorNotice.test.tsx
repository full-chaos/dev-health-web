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

    it("an action failure shows the served message only for a validation status (a 4xx but 401/403)", () => {
        for (const status of [400, 409, 422]) {
            const { unmount } = render(
                <AdminErrorNotice
                    error="Rule overlaps"
                    kind="action"
                    status={status}
                    subject="Rules"
                    onRetryAction={vi.fn()}
                />,
            );
            expect(variantOf(screen.getByText("Rule overlaps"))).toBe("danger");
            expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
            unmount();
        }
    });

    it("a 5xx, 401, 403, no status and an unknown status read one plain sentence, not the served text", () => {
        for (const status of [500, 502, 401, 403, undefined]) {
            const { container, unmount } = render(
                <AdminErrorNotice
                    error="secret backend text"
                    kind="action"
                    status={status}
                    subject="Rules"
                    onRetryAction={vi.fn()}
                />,
            );
            expect(container.textContent).not.toContain("secret backend text");
            expect(screen.getByText("The change was not saved. Try again.")).toBeInTheDocument();
            unmount();
        }
    });

    it("a 429 shows the authored rate-limit sentence, never the served text", () => {
        const { container } = render(
            <AdminErrorNotice
                error="provider says slow down: 10.1.2.3"
                kind="action"
                status={429}
                subject="Rules"
                onRetryAction={vi.fn()}
            />,
        );
        expect(container.textContent).not.toContain("10.1.2.3");
        expect(
            screen.getByText("Too many requests. Try again in some minutes."),
        ).toBeInTheDocument();
    });

    it("an embedded action-level answer (served) is shown as served", () => {
        render(
            <AdminErrorNotice
                error="The policy is inactive"
                kind="action"
                served
                subject="Rules"
                onRetryAction={vi.fn()}
            />,
        );
        expect(screen.getByText("The policy is inactive")).toBeInTheDocument();
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

/** SecurityAlertRow component tests — CHAOS-1240. */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent, cleanup } from "@/test/utils";

vi.mock("next/navigation", () => ({
    useSearchParams: () => ({ get: () => null }),
}));

import { SecurityAlertRow } from "./SecurityAlertRow";
import type { SecurityAlertRowData } from "./types";

function TableWrapper({ children }: { children: ReactNode }) {
    return (
        <table>
            <tbody>{children}</tbody>
        </table>
    );
}

function makeAlert(overrides: Partial<SecurityAlertRowData> = {}): SecurityAlertRowData {
    return {
        alertId: "alert-1",
        repoId: "repo-1",
        repoName: "org/repo-a",
        url: "https://github.com/org/repo-a/security/dependabot/1",
        source: "dependabot",
        severity: "high",
        state: "open",
        packageName: "lodash",
        cveId: "CVE-2024-0001",
        title: "Prototype pollution in lodash",
        createdAt: new Date().toISOString(),
        ...overrides,
    } as SecurityAlertRowData;
}

describe("SecurityAlertRow", () => {
    const openSpy = vi.fn();

    beforeEach(() => {
        window.open = openSpy as typeof window.open;
        openSpy.mockReset();
    });

    afterEach(() => cleanup());

    it("renders severity, source, state, and package chip", () => {
        render(<SecurityAlertRow alert={makeAlert()} />, { wrapper: TableWrapper });

        expect(screen.getByText("High")).toBeInTheDocument();
        expect(screen.getByText("Dependabot")).toBeInTheDocument();
        expect(screen.getByText("Open")).toBeInTheDocument();
        expect(screen.getByText("lodash")).toBeInTheDocument();
        expect(screen.getByText("Prototype pollution in lodash")).toBeInTheDocument();
    });

    it("renders the CVE id as a chip when packageName is absent", () => {
        render(<SecurityAlertRow alert={makeAlert({ packageName: null as unknown as string })} />, {
            wrapper: TableWrapper,
        });

        expect(screen.getByText("CVE-2024-0001")).toBeInTheDocument();
    });

    it("has the provider page as a real link in the title cell, reachable by keyboard", async () => {
        render(<SecurityAlertRow alert={makeAlert()} />, { wrapper: TableWrapper });

        const link = screen.getByRole("link", { name: /Prototype pollution/i });
        expect(link).toHaveAttribute("href", "https://github.com/org/repo-a/security/dependabot/1");
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener noreferrer");
        expect(link).toHaveAttribute("title", "Prototype pollution in lodash");
        expect(link.closest("td")).not.toBeNull();

        await userEvent.tab();
        // First stop in the row: the alert link, then the repository link.
        expect(link).toHaveFocus();
        await userEvent.tab();
        expect(screen.getByRole("link", { name: "org/repo-a" })).toHaveFocus();
    });

    it("has no click handler that opens a window, and no link nested in another", async () => {
        render(<SecurityAlertRow alert={makeAlert()} />, { wrapper: TableWrapper });

        await userEvent.click(screen.getByRole("link", { name: /Prototype pollution/i }));
        expect(openSpy).not.toHaveBeenCalled();
        for (const link of screen.getAllByRole("link")) {
            expect(link.querySelector("a, button")).toBeNull();
            expect(link.parentElement?.closest("a")).toBeNull();
        }
    });

    it("does not wrap in a link when url is not present", () => {
        render(<SecurityAlertRow alert={makeAlert({ url: null as unknown as string })} />, {
            wrapper: TableWrapper,
        });

        expect(
            screen.queryByRole("link", { name: /Prototype pollution/i }),
        ).not.toBeInTheDocument();
        expect(screen.getByText("Prototype pollution in lodash")).toBeInTheDocument();
    });

    it("shows 'just now' for a freshly created alert", () => {
        render(
            <SecurityAlertRow
                alert={makeAlert({ createdAt: new Date(Date.now() - 30_000).toISOString() })}
            />,
            { wrapper: TableWrapper },
        );

        expect(screen.getByText(/just now/i)).toBeInTheDocument();
    });
});

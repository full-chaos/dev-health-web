/** SecurityAlertRow component tests — CHAOS-1240. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent, cleanup } from "@/test/utils";

vi.mock("next/navigation", () => ({
    useSearchParams: () => ({ get: () => null }),
}));

import { SecurityAlertRow } from "./SecurityAlertRow";
import type { SecurityAlertRowData } from "./types";

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
        render(<SecurityAlertRow alert={makeAlert()} />);

        expect(screen.getByText("High")).toBeInTheDocument();
        expect(screen.getByText("Dependabot")).toBeInTheDocument();
        expect(screen.getByText("Open")).toBeInTheDocument();
        expect(screen.getByText("lodash")).toBeInTheDocument();
        expect(screen.getByText("Prototype pollution in lodash")).toBeInTheDocument();
    });

    it("renders the CVE id as a chip when packageName is absent", () => {
        render(<SecurityAlertRow alert={makeAlert({ packageName: null as unknown as string })} />);

        expect(screen.getByText("CVE-2024-0001")).toBeInTheDocument();
    });

    it("opens the alert url in a new tab when the row is clicked", async () => {
        render(<SecurityAlertRow alert={makeAlert()} />);

        const row = screen.getByRole("link", { name: /Prototype pollution/i });
        await userEvent.click(row);

        expect(openSpy).toHaveBeenCalledWith(
            "https://github.com/org/repo-a/security/dependabot/1",
            "_blank",
            "noopener,noreferrer",
        );
    });

    it("opens the alert url on Enter key press", async () => {
        render(<SecurityAlertRow alert={makeAlert()} />);

        const row = screen.getByRole("link", { name: /Prototype pollution/i });
        row.focus();
        await userEvent.keyboard("{Enter}");

        expect(openSpy).toHaveBeenCalledTimes(1);
    });

    it("does not wrap in a link when url is not present", () => {
        render(<SecurityAlertRow alert={makeAlert({ url: null as unknown as string })} />);

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
        );

        expect(screen.getByText(/just now/i)).toBeInTheDocument();
    });
});

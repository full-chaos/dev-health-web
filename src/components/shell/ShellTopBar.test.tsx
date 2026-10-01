import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

import { ShellStatusChip, shellStatusFromMeta } from "./ShellStatusChip";
import { ShellTopBar } from "./ShellTopBar";

const navigationMock = vi.hoisted(() => ({ pathname: "/dashboard" }));
const getApiMetaMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
    usePathname: () => navigationMock.pathname,
}));

vi.mock("@/lib/api/system", () => ({
    getApiMeta: getApiMetaMock,
}));

function chip() {
    return screen.getByTestId("shell-status-chip");
}

beforeEach(() => {
    navigationMock.pathname = "/dashboard";
    getApiMetaMock.mockReset();
    // Never settles: the trail tests do not depend on the chip state.
    getApiMetaMock.mockReturnValue(new Promise(() => {}));
});

describe("ShellTopBar — location trail from the nav config (A6)", () => {
    it("is one banner landmark", () => {
        render(<ShellTopBar />);

        expect(screen.getAllByRole("banner")).toHaveLength(1);
        expect(screen.getByTestId("shell-top-bar").tagName).toBe("HEADER");
    });

    it("shows the area as the current crumb on an area with no child (Cockpit)", () => {
        render(<ShellTopBar />);

        const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(within(trail).getByText("Cockpit")).toHaveAttribute("aria-current", "page");
        expect(within(trail).queryAllByRole("link")).toHaveLength(0);
    });

    it("shows Area / Destination on a child route, with the area as a link", () => {
        navigationMock.pathname = "/investment";
        render(<ShellTopBar />);

        const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(within(trail).getByRole("link", { name: "Diagnose" })).toHaveAttribute(
            "href",
            "/diagnose",
        );
        expect(within(trail).getByText("Investment")).toHaveAttribute("aria-current", "page");
    });

    it("shows no trail on a route that no area owns", () => {
        navigationMock.pathname = "/prs/repo:1";
        render(<ShellTopBar />);

        expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
        expect(chip()).toBeInTheDocument();
    });
});

describe("ShellTopBar — theme toggle slot", () => {
    it("renders an empty slot until a toggle is passed", () => {
        const { container } = render(<ShellTopBar />);

        const slot = container.querySelector("[data-slot='theme-toggle']");
        expect(slot).not.toBeNull();
        expect(slot).toBeEmptyDOMElement();
    });

    it("renders the passed toggle inside the slot", () => {
        const { container } = render(
            <ShellTopBar themeToggle={<button type="button">Toggle theme</button>} />,
        );

        const slot = container.querySelector("[data-slot='theme-toggle']");
        expect(slot).toContainElement(screen.getByRole("button", { name: "Toggle theme" }));
    });
});

describe("shellStatusFromMeta — unknown is its own state", () => {
    it("is synced only for a real timestamp", () => {
        expect(shellStatusFromMeta({ last_ingest_at: "2026-09-30T10:00:00Z" })).toEqual({
            kind: "synced",
            at: "2026-09-30T10:00:00Z",
        });
    });

    it("is empty when the backend answers that nothing was ingested", () => {
        expect(shellStatusFromMeta({ last_ingest_at: null })).toEqual({ kind: "empty" });
    });

    it.each([
        ["null", null],
        ["undefined", undefined],
        ["an empty object", {}],
        ["a string", "ok"],
        ["an array", []],
        ["a value that is not a date", { last_ingest_at: "not-a-date" }],
        ["an empty string", { last_ingest_at: "" }],
        ["a number", { last_ingest_at: 1759226400 }],
    ])("is unknown for %s", (_label, meta) => {
        expect(shellStatusFromMeta(meta)).toEqual({ kind: "unknown" });
    });
});

describe("ShellStatusChip — never looks healthy when the state is not known", () => {
    it("asks for the backend meta once and is neutral while it waits", () => {
        render(<ShellStatusChip />);

        expect(getApiMetaMock).toHaveBeenCalledTimes(1);
        expect(chip()).toHaveAttribute("data-status", "loading");
        expect(chip()).toHaveTextContent("Checking data status");
        expect(chip()).not.toHaveTextContent("Synced");
    });

    it("shows the sync time when the backend returns one", async () => {
        getApiMetaMock.mockResolvedValue({ last_ingest_at: "2026-09-30T10:00:00Z" });
        render(<ShellStatusChip />);

        await waitFor(() => expect(chip()).toHaveAttribute("data-status", "synced"));
        expect(chip()).toHaveTextContent(/^Synced /);
        expect(chip()).not.toHaveTextContent("Unavailable");
    });

    it("shows 'No data yet' when nothing was ingested", async () => {
        getApiMetaMock.mockResolvedValue({ last_ingest_at: null });
        render(<ShellStatusChip />);

        await waitFor(() => expect(chip()).toHaveAttribute("data-status", "empty"));
        expect(chip()).toHaveTextContent("No data yet");
    });

    it.each([
        [
            "the request fails (the fetcher answers null)",
            () => getApiMetaMock.mockResolvedValue(null),
        ],
        ["the fetcher rejects", () => getApiMetaMock.mockRejectedValue(new Error("503"))],
        ["the answer has no sync field", () => getApiMetaMock.mockResolvedValue({ version: "1" })],
        [
            "the sync value is not a date",
            () => getApiMetaMock.mockResolvedValue({ last_ingest_at: "soon" }),
        ],
    ])("shows the neutral 'Status unavailable' state when %s", async (_label, arrange) => {
        arrange();
        render(<ShellStatusChip />);

        await waitFor(() => expect(chip()).toHaveAttribute("data-status", "unknown"));
        expect(chip()).toHaveTextContent("Status unavailable");
        expect(chip()).not.toHaveTextContent("Synced");
        expect(chip()).not.toHaveTextContent("No data yet");
        // The neutral dot: not the data colour and not the caution colour.
        const dot = chip().querySelector("span[aria-hidden='true']");
        expect(dot?.className).toContain("bg-(--text-muted)");
        expect(dot?.className).not.toContain("--info");
        expect(dot?.className).not.toContain("--caution");
    });
});

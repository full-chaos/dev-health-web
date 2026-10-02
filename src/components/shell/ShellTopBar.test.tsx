import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { ShellStatusChip, shellStatusFromOrganization, type ShellStatus } from "./ShellStatusChip";
import { ShellTopBar } from "./ShellTopBar";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, encodeFilterParam } from "@/lib/filters/encode";
import { encodeSecurityFilter } from "@/lib/filters/security";
import type { MetricFilter } from "@/lib/filters/types";
import { withFilterParam } from "@/lib/filters/url";

const navigationMock = vi.hoisted(() => ({ pathname: "/dashboard", search: "" }));

vi.mock("next/navigation", () => ({
    usePathname: () => navigationMock.pathname,
    useSearchParams: () => new URLSearchParams(navigationMock.search),
}));

const LOADING: ShellStatus = { kind: "loading" };

function chip() {
    return screen.getByTestId("shell-status-chip");
}

function dot() {
    return chip().querySelector("span[aria-hidden='true']");
}

beforeEach(() => {
    navigationMock.pathname = "/dashboard";
    navigationMock.search = "";
});

describe("ShellTopBar — location trail from the nav config (A6)", () => {
    it("is one banner landmark", () => {
        render(<ShellTopBar status={LOADING} />);

        expect(screen.getAllByRole("banner")).toHaveLength(1);
        expect(screen.getByTestId("shell-top-bar").tagName).toBe("HEADER");
    });

    it("shows the area as the current crumb on an area with no child (Home)", () => {
        render(<ShellTopBar status={LOADING} />);

        const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(within(trail).getByText("Home")).toHaveAttribute("aria-current", "page");
        expect(within(trail).queryAllByRole("link")).toHaveLength(0);
    });

    it("shows Area / Destination on a child route, with the area as a link", () => {
        navigationMock.pathname = "/investment";
        render(<ShellTopBar status={LOADING} />);

        const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(within(trail).getByRole("link", { name: "Diagnose" })).toHaveAttribute(
            "href",
            expect.stringMatching(/^\/diagnose\?f=/),
        );
        expect(within(trail).getByText("Investment")).toHaveAttribute("aria-current", "page");
    });

    it("shows no trail on a route that no area owns", () => {
        navigationMock.pathname = "/demo";
        render(<ShellTopBar status={LOADING} />);

        expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
        expect(chip()).toBeInTheDocument();
    });
});

describe("ShellTopBar — a crumb link is the return path and keeps the user's state", () => {
    const filter: MetricFilter = {
        ...defaultMetricFilter,
        scope: { level: "team", ids: ["platform"] },
        time: { range_days: 90, compare_days: 90 },
    };

    function areaCrumb() {
        const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
        const link = within(trail).getByRole("link", { name: "Diagnose" });
        return new URL(link.getAttribute("href") ?? "", "https://app.example");
    }

    it("carries f, role, lens and origin, as the in-page 'Back to Diagnose' link did", () => {
        navigationMock.pathname = "/investment";
        navigationMock.search = `f=${encodeFilterParam(filter)}&role=em&lens=pm&origin=cockpit`;
        render(<ShellTopBar status={LOADING} />);

        const url = areaCrumb();
        expect(url.pathname).toBe("/diagnose");
        expect(decodeFilter(url.searchParams.get("f") ?? "")).toEqual(filter);
        expect(url.searchParams.get("role")).toBe("em");
        expect(url.searchParams.get("lens")).toBe("pm");
        expect(url.searchParams.get("origin")).toBe("cockpit");
        // The same target and state as the BackLink the page had.
        const backLink = new URL(
            withFilterParam("/diagnose", filter, "em", "cockpit"),
            "https://app.example",
        );
        expect(url.pathname).toBe(backLink.pathname);
        for (const key of ["f", "role", "origin"]) {
            expect(url.searchParams.get(key)).toBe(backLink.searchParams.get(key));
        }
    });

    it("adds no role, lens or origin that the URL does not have", () => {
        navigationMock.pathname = "/investment";
        render(<ShellTopBar status={LOADING} />);

        const url = areaCrumb();
        expect(url.searchParams.has("f")).toBe(true);
        expect(url.searchParams.has("role")).toBe(false);
        expect(url.searchParams.has("lens")).toBe(false);
        expect(url.searchParams.has("origin")).toBe(false);
    });
});

describe("ShellTopBar — a route with its own `f` encoding (Security)", () => {
    const SECURITY_F = encodeSecurityFilter({
        openOnly: false,
        severities: ["critical"],
        repoIds: ["repo-1"],
    });
    const DEFAULT_F = encodeFilterParam(defaultMetricFilter);

    it.each(["/security", "/security/repos/repo-1"])(
        "%s: the crumb links carry the default metric filter, not the Security filter",
        (pathname) => {
            navigationMock.pathname = pathname;
            navigationMock.search = `f=${SECURITY_F}`;
            render(<ShellTopBar status={LOADING} />);

            const links = within(
                screen.getByRole("navigation", { name: "Breadcrumb" }),
            ).getAllByRole("link");
            expect(links.length).toBeGreaterThan(0);
            for (const link of links) {
                const href = link.getAttribute("href") ?? "";
                const params = new URL(href, "https://app.example").searchParams;
                expect(params.get("f"), href).toBe(DEFAULT_F);
            }
        },
    );
});

describe("ShellTopBar — theme toggle slot", () => {
    it("renders an empty slot until a toggle is passed", () => {
        const { container } = render(<ShellTopBar status={LOADING} />);

        const slot = container.querySelector("[data-slot='theme-toggle']");
        expect(slot).not.toBeNull();
        expect(slot).toBeEmptyDOMElement();
    });

    it("renders the passed toggle inside the slot", () => {
        const { container } = render(
            <ShellTopBar
                status={LOADING}
                themeToggle={<button type="button">Toggle theme</button>}
            />,
        );

        const slot = container.querySelector("[data-slot='theme-toggle']");
        expect(slot).toContainElement(screen.getByRole("button", { name: "Toggle theme" }));
    });
});

describe("ShellTopBar — prototype order", () => {
    it("puts the breadcrumb first, then the search, then the status and the toggle on the right", () => {
        const { container } = render(
            <ShellTopBar status={LOADING} themeToggle={<button type="button">Toggle</button>} />,
        );
        const bar = container.querySelector("[data-testid='shell-top-bar']") as HTMLElement;
        const kids = Array.from(bar.children);
        expect(kids).toHaveLength(3);
        expect(kids[0].querySelector("[data-testid='breadcrumbs']")).not.toBeNull();
        expect(kids[1]).toBe(screen.getByTestId("command-palette-trigger"));
        expect(kids[2].className).toContain("ml-auto");
        expect(kids[2]).toContainElement(screen.getByRole("button", { name: "Toggle" }));
        expect(kids[2].querySelector("[data-testid='shell-status-chip']")).not.toBeNull();
    });

    it("draws the search as a wide, 36px, 6px-radius field with the key hint at its right", () => {
        render(<ShellTopBar status={LOADING} />);
        const trigger = screen.getByTestId("command-palette-trigger");
        expect(trigger.className).toContain("flex-1");
        expect(trigger.className).toContain("max-w-95");
        expect(trigger.className).toContain("h-9");
        expect(trigger.className).toContain("rounded-md");
        expect(trigger.querySelector("kbd")?.className).toContain("ml-auto");
    });
});

describe("ShellTopBar — surface", () => {
    it("is the surface at 92% with an 8px blur, as the prototype `.topbar` (theme.css:59)", () => {
        render(<ShellTopBar status={LOADING} />);
        const bar = screen.getByTestId("shell-top-bar");
        expect(bar.className).toContain("bg-(--surface)/92");
        expect(bar.className).toContain("backdrop-blur-sm");
        expect(bar.className).toContain("border-b");
    });
});

describe("shellStatusFromOrganization — unknown is its own state", () => {
    it("is synced for an organization with data and a real timestamp", () => {
        expect(
            shellStatusFromOrganization({ hasData: true, lastMetricsAt: "2026-09-30T10:00:00Z" }),
        ).toEqual({ kind: "synced", at: "2026-09-30T10:00:00Z" });
    });

    it("is empty only when the organization is known to have no data", () => {
        expect(shellStatusFromOrganization({ hasData: false, lastMetricsAt: null })).toEqual({
            kind: "empty",
        });
    });

    it.each([
        ["no timestamp", { hasData: true, lastMetricsAt: null }],
        ["a timestamp that is not a date", { hasData: true, lastMetricsAt: "soon" }],
    ])("is present, with no time, for an organization with data and %s", (_label, organization) => {
        expect(shellStatusFromOrganization(organization)).toEqual({ kind: "present" });
    });

    it.each([
        ["null (the request failed)", null],
        ["undefined", undefined],
        ["an empty object", {}],
        ["a string", "ok"],
        ["a data flag that is not a boolean", { hasData: "yes", lastMetricsAt: null }],
        ["a timestamp with no data flag", { lastMetricsAt: "2026-09-30T10:00:00Z" }],
    ])("is unknown for %s", (_label, organization) => {
        expect(shellStatusFromOrganization(organization)).toEqual({ kind: "unknown" });
    });
});

describe("ShellStatusChip — never looks healthy, or empty, when the state is not known", () => {
    it("is neutral while the organization data loads", () => {
        render(<ShellStatusChip status={{ kind: "loading" }} />);

        expect(chip()).toHaveAttribute("data-status", "loading");
        expect(chip()).toHaveAttribute("aria-busy", "true");
        expect(chip()).toHaveTextContent("Checking data status");
        expect(dot()?.className).toContain("bg-(--text-muted)");
    });

    it("shows the neutral 'Status unavailable' state when the state is unknown", () => {
        render(<ShellStatusChip status={{ kind: "unknown" }} />);

        expect(chip()).toHaveTextContent("Status unavailable");
        expect(chip()).not.toHaveTextContent("Data through");
        expect(chip()).not.toHaveTextContent("No data yet");
        // The neutral dot: not the data colour and not the caution colour.
        expect(dot()?.className).toContain("bg-(--text-muted)");
        expect(dot()?.className).not.toContain("--info");
        expect(dot()?.className).not.toContain("--caution");
    });

    it("shows 'No data yet' with the caution dot for an organization with no data", () => {
        render(<ShellStatusChip status={{ kind: "empty" }} />);

        expect(chip()).toHaveTextContent("No data yet");
        expect(dot()?.className).toContain("bg-(--caution)");
    });

    it("shows the data time with the data colour, and no health word", () => {
        render(<ShellStatusChip status={{ kind: "synced", at: "2026-09-30T10:00:00Z" }} />);

        expect(chip()).toHaveTextContent(/^Data through /);
        expect(chip()).not.toHaveTextContent("Unavailable");
        expect(chip()).not.toHaveTextContent(/healthy|ok|connected/i);
        expect(dot()?.className).toContain("bg-(--info)");
    });

    it("shows 'Has data' when the organization has data and no time is known", () => {
        render(<ShellStatusChip status={{ kind: "present" }} />);

        expect(chip()).toHaveTextContent("Has data");
    });

    it("passes the status from the top bar to the chip", () => {
        render(<ShellTopBar status={{ kind: "empty" }} />);

        expect(chip()).toHaveAttribute("data-status", "empty");
    });
});

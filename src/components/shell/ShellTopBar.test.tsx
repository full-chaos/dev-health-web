import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

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

beforeEach(() => {
    navigationMock.pathname = "/dashboard";
    navigationMock.search = "";
});

describe("ShellTopBar — location trail from the nav config (A6)", () => {
    it("names the metric on a metric evidence page", () => {
        navigationMock.pathname = "/explore";
        navigationMock.search = "metric=blocked_work";
        render(<ShellTopBar />);

        const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(trail).toHaveTextContent("Diagnose");
        expect(within(trail).getByText("Blocked Work evidence")).toHaveAttribute(
            "aria-current",
            "page",
        );
    });

    it("is one banner landmark", () => {
        render(<ShellTopBar />);

        expect(screen.getAllByRole("banner")).toHaveLength(1);
        expect(screen.getByTestId("shell-top-bar").tagName).toBe("HEADER");
    });

    it("is 66px high, as the prototype top bar", () => {
        render(<ShellTopBar />);

        expect(screen.getByTestId("shell-top-bar")).toHaveClass("h-(--shell-topbar-h)");
    });

    it("shows the area as the current crumb on an area with no child (Home)", () => {
        render(<ShellTopBar />);

        const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(within(trail).getByText("Home")).toHaveAttribute("aria-current", "page");
        expect(within(trail).queryAllByRole("link")).toHaveLength(0);
    });

    it("shows Area / Destination on a child route, with the area as a link", () => {
        navigationMock.pathname = "/investment";
        render(<ShellTopBar />);

        const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(within(trail).getByRole("link", { name: "Diagnose" })).toHaveAttribute(
            "href",
            expect.stringMatching(/^\/diagnose\?f=/),
        );
        expect(within(trail).getByText("Investment")).toHaveAttribute("aria-current", "page");
    });

    it("shows no trail on a route that no area owns", () => {
        navigationMock.pathname = "/demo";
        render(<ShellTopBar />);

        expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
        expect(screen.getByTestId("shell-top-bar")).toBeInTheDocument();
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
        render(<ShellTopBar />);

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
        render(<ShellTopBar />);

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
            render(<ShellTopBar />);

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

describe("ShellTopBar — prototype order", () => {
    it("puts the breadcrumb first, then the search, then the toggle on the right", () => {
        const { container } = render(
            <ShellTopBar themeToggle={<button type="button">Toggle</button>} />,
        );
        const bar = container.querySelector("[data-testid='shell-top-bar']") as HTMLElement;
        const kids = Array.from(bar.children);
        expect(kids).toHaveLength(3);
        expect(kids[0].querySelector("[data-testid='breadcrumbs']")).not.toBeNull();
        expect(kids[1]).toBe(screen.getByTestId("command-palette-trigger"));
        expect(kids[2].className).toContain("ml-auto");
        expect(kids[2]).toContainElement(screen.getByRole("button", { name: "Toggle" }));
        expect(kids[2].querySelector("[data-testid='shell-status-chip']")).toBeNull();
    });

    it("draws the search as a wide, 36px, 6px-radius field with the key hint at its right", () => {
        render(<ShellTopBar />);
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
        render(<ShellTopBar />);
        const bar = screen.getByTestId("shell-top-bar");
        expect(bar.className).toContain("bg-(--surface)/92");
        expect(bar.className).toContain("backdrop-blur-sm");
        expect(bar.className).toContain("border-b");
    });
});

describe("ShellTopBar — no data-freshness chip (CHAOS-8432)", () => {
    it("has no 'Data through' text and no status chip: the fact lives under the account name", () => {
        const { container } = render(
            <ShellTopBar themeToggle={<button type="button">Toggle</button>} />,
        );

        expect(screen.queryByTestId("shell-status-chip")).toBeNull();
        expect(container).not.toHaveTextContent("Data through");
    });
});

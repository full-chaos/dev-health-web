import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { encodeSecurityFilter } from "@/lib/filters/security";

import { ScopeBarFrame, type ScopeBarFrameProps } from "./ScopeBarFrame";
import { ShellOrganizationProvider } from "./ShellContext";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
const toastSuccess = vi.hoisted(() => vi.fn());

// The frame must not use the router. The mock is here to prove that: a call
// from the frame, or from a hook under it, is seen.
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/security",
    useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("sonner", () => ({ toast: { success: toastSuccess } }));

// Repository ids of a page's own filter are not the names the menu shows.
const API = "0b1f6a52-6f0b-4f4e-9d0a-1c2d3e4f5a61";
const WEB = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const OPTIONS = [
    { id: API, label: "org/api" },
    { id: WEB, label: "org/web" },
];
const SECURITY_F = encodeSecurityFilter({ openOnly: false, severities: ["critical"] });

function renderFrame(props: Partial<ScopeBarFrameProps> = {}) {
    const onChange = vi.fn();
    const onReset = vi.fn();
    const utils = render(
        <ScopeBarFrame
            orgName="Test"
            repos={{ options: OPTIONS, selected: [], onChange }}
            onReset={onReset}
            {...props}
        />,
    );
    return { ...utils, onChange, onReset };
}

function row() {
    return screen.getByTestId("scope-bar-row");
}

function stubClipboard(writeText: (value: string) => Promise<void>) {
    Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
    });
}

beforeEach(() => {
    router.replace.mockClear();
    router.push.mockClear();
    toastSuccess.mockClear();
    window.history.replaceState({}, "", `/security?f=${SECURITY_F}&role=em`);
});

describe("ScopeBarFrame — organization and repository only", () => {
    it("is the scope region with organization, repository and the two actions in one row", () => {
        renderFrame();

        expect(screen.getByRole("region", { name: "Scope" })).toBe(screen.getByTestId("scope-bar"));
        const inRow = within(row());
        expect(inRow.getByRole("button", { name: "Test" })).toBeInTheDocument();
        expect(inRow.getByRole("button", { name: /^Repo/ })).toHaveTextContent("All");
        expect(inRow.getByRole("button", { name: "Reset" })).toBeInTheDocument();
        expect(inRow.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    });

    it("has no team, no window and no filter drawer", () => {
        renderFrame();

        expect(screen.queryByRole("button", { name: /^Team/ })).toBeNull();
        expect(screen.queryByRole("group", { name: "Window" })).toBeNull();
        expect(screen.queryByRole("button", { name: /^Filters/ })).toBeNull();
        expect(screen.queryByRole("button", { name: /^Developer/ })).toBeNull();
    });

    it("has only the organization when the page gives no repository control", () => {
        render(<ScopeBarFrame orgName="Test" onReset={vi.fn()} />);

        expect(screen.queryByRole("button", { name: /^Repo/ })).toBeNull();
        expect(screen.getByRole("button", { name: "Test" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
    });

    it("takes the organization name from the prop, then from the shell, then a neutral word", () => {
        const first = render(
            <ShellOrganizationProvider value={{ name: "Acme", hasData: true, lastMetricsAt: null }}>
                <ScopeBarFrame onReset={vi.fn()} />
            </ShellOrganizationProvider>,
        );
        expect(within(row()).getByRole("button", { name: "Acme" })).toBeInTheDocument();
        first.unmount();

        const second = render(<ScopeBarFrame orgName="From prop" onReset={vi.fn()} />);
        expect(within(row()).getByRole("button", { name: "From prop" })).toBeInTheDocument();
        second.unmount();

        render(<ScopeBarFrame onReset={vi.fn()} />);
        expect(within(row()).getByRole("button", { name: "Organization" })).toBeInTheDocument();
    });
});

describe("ScopeBarFrame — does not read or write the URL", () => {
    it("writes nothing on mount with a page filter in `f`", async () => {
        renderFrame();

        await new Promise((resolveTimer) => setTimeout(resolveTimer, 20));
        expect(router.replace).not.toHaveBeenCalled();
        expect(router.push).not.toHaveBeenCalled();
        expect(new URLSearchParams(window.location.search).get("f")).toBe(SECURITY_F);
    });

    it("gives a repository change to the owner and does not touch the router", async () => {
        const user = userEvent.setup();
        const { onChange } = renderFrame();

        await user.click(screen.getByRole("button", { name: /^Repo/ }));
        await user.click(screen.getByRole("checkbox", { name: "org/web" }));

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(router.replace).not.toHaveBeenCalled();
        expect(new URLSearchParams(window.location.search).get("f")).toBe(SECURITY_F);
    });

    it("has no URL hook and no filter state hook in its source", () => {
        for (const file of ["ScopeBarFrame.tsx", "useCopyLink.ts"]) {
            const source = readFileSync(resolve(__dirname, file), "utf8");
            expect(source, file).not.toContain("next/navigation");
            expect(source, file).not.toContain("useFilterBarState");
            expect(source, file).not.toContain("useScopeBarState");
            expect(source, file).not.toContain("useFilterOptions");
            expect(source, file).not.toContain("encodeFilterParam");
        }
    });
});

describe("ScopeBarFrame — the repository control is the owner's", () => {
    it("shows the names and gives the ids: the two are different id spaces", async () => {
        const user = userEvent.setup();
        const { onChange } = renderFrame();

        await user.click(screen.getByRole("button", { name: /^Repo/ }));
        expect(screen.getByRole("checkbox", { name: "org/api" })).not.toBeChecked();
        expect(screen.queryByText(API)).toBeNull();
        await user.click(screen.getByRole("checkbox", { name: "org/api" }));

        expect(onChange).toHaveBeenCalledWith([API]);
    });

    it("shows the selected repository by its name, not by its id", () => {
        renderFrame({ repos: { options: OPTIONS, selected: [WEB], onChange: vi.fn() } });

        expect(screen.getByRole("button", { name: /^Repo/ })).toHaveTextContent("org/web");
        expect(screen.getByRole("button", { name: /^Repo/ })).not.toHaveTextContent(WEB);
    });

    it("adds to and removes from the selection with ids", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(
            <ScopeBarFrame
                orgName="Test"
                repos={{ options: OPTIONS, selected: [WEB], onChange }}
                onReset={vi.fn()}
            />,
        );

        await user.click(screen.getByRole("button", { name: /^Repo/ }));
        await user.click(screen.getByRole("checkbox", { name: "org/api" }));
        expect(onChange).toHaveBeenLastCalledWith([WEB, API]);

        await user.click(screen.getByRole("checkbox", { name: "org/web" }));
        expect(onChange).toHaveBeenLastCalledWith([]);

        await user.click(screen.getByRole("checkbox", { name: "All" }));
        expect(onChange).toHaveBeenLastCalledWith([]);
    });

    it("shows a selected id that has no option as Unresolved, and keeps the id in a change", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(
            <ScopeBarFrame
                orgName="Test"
                repos={{ options: OPTIONS, selected: ["unknown-id"], onChange }}
                onReset={vi.fn()}
            />,
        );

        expect(screen.getByRole("button", { name: /^Repo/ })).toHaveTextContent("Unresolved");
        await user.click(screen.getByRole("button", { name: /^Repo/ }));
        await user.click(screen.getByRole("checkbox", { name: "org/api" }));

        expect(onChange).toHaveBeenLastCalledWith(["unknown-id", API]);
    });

    it("tells two repositories with one name apart by a number, never the id", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(
            <ScopeBarFrame
                orgName="Test"
                repos={{
                    options: [
                        { id: "id-1", label: "org/api" },
                        { id: "id-2", label: "org/api" },
                    ],
                    selected: [],
                    onChange,
                }}
                onReset={vi.fn()}
            />,
        );

        await user.click(screen.getByRole("button", { name: /^Repo/ }));
        await user.click(screen.getByRole("checkbox", { name: "org/api (2)" }));

        expect(onChange).toHaveBeenCalledWith(["id-2"]);
    });

    it("closes the menu on a click outside the bar", async () => {
        const user = userEvent.setup();
        const { container } = renderFrame();
        const outside = document.createElement("button");
        container.parentElement?.appendChild(outside);

        await user.click(screen.getByRole("button", { name: /^Repo/ }));
        expect(screen.getByRole("checkbox", { name: "org/api" })).toBeInTheDocument();
        await user.click(outside);

        expect(screen.queryByRole("checkbox", { name: "org/api" })).toBeNull();
    });
});

describe("ScopeBarFrame — organization", () => {
    it("is selected when no repository is selected, and a click then changes nothing", async () => {
        const user = userEvent.setup();
        const { onChange } = renderFrame();
        const organization = screen.getByRole("button", { name: "Test" });

        expect(organization).toHaveAttribute("aria-pressed", "true");
        await user.click(organization);

        expect(onChange).not.toHaveBeenCalled();
    });

    it("is not selected with a repository, and a click clears the repositories", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(
            <ScopeBarFrame
                orgName="Test"
                repos={{ options: OPTIONS, selected: [API], onChange }}
                onReset={vi.fn()}
            />,
        );
        const organization = screen.getByRole("button", { name: "Test" });

        expect(organization).toHaveAttribute("aria-pressed", "false");
        await user.click(organization);

        expect(onChange).toHaveBeenCalledWith([]);
    });
});

describe("ScopeBarFrame — a repository fixed by the route", () => {
    it("disables the repository and organization controls and opens no menu", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(
            <ScopeBarFrame
                orgName="Test"
                repos={{ options: OPTIONS, selected: [API], onChange, locked: true }}
                onReset={vi.fn()}
            />,
        );
        const repository = screen.getByRole("button", { name: /^Repo/ });

        expect(repository).toBeDisabled();
        expect(repository).toHaveTextContent("org/api");
        expect(screen.getByRole("button", { name: "Test" })).toBeDisabled();
        await user.click(repository);
        await user.click(screen.getByRole("button", { name: "Test" }));

        expect(screen.queryByRole("checkbox")).toBeNull();
        expect(onChange).not.toHaveBeenCalled();
    });

    it("keeps the controls enabled when the repository is not fixed", () => {
        renderFrame();

        expect(screen.getByRole("button", { name: /^Repo/ })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Test" })).toBeEnabled();
    });
});

describe("ScopeBarFrame — actions", () => {
    it("Reset calls the owner's reset", async () => {
        const user = userEvent.setup();
        const { onReset, onChange } = renderFrame();

        await user.click(screen.getByRole("button", { name: "Reset" }));

        expect(onReset).toHaveBeenCalledTimes(1);
        expect(onChange).not.toHaveBeenCalled();
        expect(router.replace).not.toHaveBeenCalled();
    });

    it("Copy link copies the full page URL, with the page's own `f`", async () => {
        const user = userEvent.setup();
        let copied = "";
        stubClipboard(async (value) => {
            copied = value;
        });
        renderFrame();

        await user.click(screen.getByRole("button", { name: "Copy link" }));

        await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Link copied"));
        expect(copied).toBe(window.location.href);
        expect(new URL(copied).searchParams.get("f")).toBe(SECURITY_F);
        expect(new URL(copied).searchParams.get("role")).toBe("em");
    });

    it("shows the URL in a field when the clipboard refuses", async () => {
        const user = userEvent.setup();
        stubClipboard(() => Promise.reject(new Error("denied")));
        renderFrame();

        await user.click(screen.getByRole("button", { name: "Copy link" }));

        const fallback = await screen.findByTestId("scope-bar-copy-fallback");
        expect(within(fallback).getByRole("textbox")).toHaveValue(window.location.href);
        expect(toastSuccess).not.toHaveBeenCalled();
    });
});

describe("ScopeBarFrame — page-control rows", () => {
    it("renders the rows inside the scope bar card, below the scope row", () => {
        renderFrame({
            children: (
                <>
                    <div data-testid="severity-row">Severity</div>
                    <div data-testid="state-row">State</div>
                </>
            ),
        });

        const rows = screen.getByTestId("scope-bar-rows");
        expect(screen.getByTestId("scope-bar")).toContainElement(rows);
        expect(rows).toContainElement(screen.getByTestId("severity-row"));
        expect(rows).toContainElement(screen.getByTestId("state-row"));
        expect(row()).not.toContainElement(rows);
        expect(row().compareDocumentPosition(rows) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("has no rows container and no divider when the page gives no row", () => {
        renderFrame();

        expect(screen.queryByTestId("scope-bar-rows")).toBeNull();
        expect(screen.getByTestId("scope-bar").children).toHaveLength(1);
    });

    it("draws the actions as the prototype does: Reset ghost small, Copy link small with an icon", () => {
        renderFrame();
        const reset = screen.getByRole("button", { name: "Reset" });
        const copy = screen.getByRole("button", { name: "Copy link" });
        expect(reset.querySelector("svg")).toBeNull();
        expect(reset.className).toContain("bg-transparent");
        expect(reset.className).toContain("min-h-7");
        expect(copy.querySelector("svg.lucide-copy")).not.toBeNull();
        expect(copy.className).toContain("min-h-7");
        expect(copy.className).not.toContain("bg-transparent");
    });
});

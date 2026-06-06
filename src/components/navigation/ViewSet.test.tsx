import { describe, expect, it, vi } from "vitest";
import { screen } from "@/test/utils";
import { render } from "@/test/utils";
import { ViewSet, type ViewSetItem } from "./ViewSet";

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: {
        href: string;
        children: React.ReactNode;
        [key: string]: unknown;
    }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

const items: ViewSetItem[] = [
    {
        id: "flow",
        label: "Renamed Flow Label",
        path: "/metrics?team=platform",
        navVisible: true,
    },
    {
        id: "govern-overview",
        label: "Govern Summary",
        path: "/testops",
        navVisible: true,
    },
    {
        id: "preview-route",
        label: "Preview Route",
        path: "/preview",
        navVisible: true,
        preview: true,
    },
    {
        id: "hidden-route",
        label: "Hidden Route",
        path: "/hidden",
        navVisible: false,
    },
    {
        id: "demoted-route",
        label: "Demoted Route",
        path: "/demoted",
        navVisible: true,
        demoted: true,
    },
];

describe("ViewSet", () => {
    it("renders vertical view links from nav-visible item data only", () => {
        render(<ViewSet orientation="vertical" items={items} activeId="flow" />);

        expect(screen.getByRole("link", { name: "Renamed Flow Label" })).toHaveAttribute(
            "href",
            "/metrics?team=platform",
        );
        expect(screen.getByRole("link", { name: "Demoted Route" })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Preview Route" })).toBeNull();
        expect(screen.queryByRole("link", { name: "Hidden Route" })).toBeNull();
    });

    it("renders tabs from nav-visible item data only", () => {
        render(
            <ViewSet orientation="tabs" items={items} activeId="flow" ariaLabel="Govern views" />,
        );

        expect(screen.getByRole("tablist", { name: "Govern views" })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Renamed Flow Label" })).toHaveAttribute(
            "href",
            "/metrics?team=platform",
        );
        expect(screen.queryByRole("tab", { name: "Preview Route" })).toBeNull();
        expect(screen.queryByRole("tab", { name: "Hidden Route" })).toBeNull();
    });

    it("orders overview first, then preserves input order for the remaining visible items", () => {
        render(<ViewSet orientation="vertical" items={items} activeId="flow" />);

        const labels = screen.getAllByRole("link").map((link) => link.textContent);
        expect(labels).toEqual(["Govern Summary", "Renamed Flow Label", "Demoted Route"]);
    });

    it("marks the active vertical item as the current page", () => {
        render(<ViewSet orientation="vertical" items={items} activeId="flow" />);

        expect(screen.getByRole("link", { name: "Renamed Flow Label" })).toHaveAttribute(
            "aria-current",
            "page",
        );
        expect(screen.getByRole("link", { name: "Govern Summary" })).not.toHaveAttribute(
            "aria-current",
        );
    });

    it("marks the active tab with tab semantics and current-page state", () => {
        render(<ViewSet orientation="tabs" items={items} activeId="flow" />);

        expect(screen.getByRole("tab", { name: "Renamed Flow Label" })).toHaveAttribute(
            "aria-selected",
            "true",
        );
        expect(screen.getByRole("tab", { name: "Renamed Flow Label" })).toHaveAttribute(
            "aria-current",
            "page",
        );
        expect(screen.getByRole("tab", { name: "Govern Summary" })).toHaveAttribute(
            "aria-selected",
            "false",
        );
    });
});

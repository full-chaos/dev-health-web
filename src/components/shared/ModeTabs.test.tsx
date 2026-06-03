import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { ModeTabs, type ModeTabItem } from "./ModeTabs";

import { vi } from "vitest";

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

const items: ModeTabItem[] = [
  { id: "a", label: "Alpha", href: "/a" },
  { id: "b", label: "Beta", href: "/b", badge: <span>Preview</span> },
  { id: "c", label: "Gamma", href: "/c" },
];

describe("ModeTabs", () => {
  it("renders all tabs as links with hrefs", () => {
    render(<ModeTabs items={items} activeId="a" ariaLabel="Test tabs" />);
    expect(screen.getByText("Alpha").closest("a")).toHaveAttribute("href", "/a");
    expect(screen.getByText("Gamma").closest("a")).toHaveAttribute("href", "/c");
  });

  it("marks only the active tab with aria-current='page'", () => {
    render(<ModeTabs items={items} activeId="b" ariaLabel="Test tabs" />);
    expect(screen.getByText("Beta").closest("a")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Alpha").closest("a")).not.toHaveAttribute("aria-current");
  });

  it("renders optional badges", () => {
    render(<ModeTabs items={items} activeId="a" ariaLabel="Test tabs" />);
    expect(screen.getByText("Preview")).toBeInTheDocument();
  });

  it("exposes an accessible nav label", () => {
    render(<ModeTabs items={items} activeId="a" ariaLabel="Work views" />);
    expect(screen.getByRole("navigation", { name: "Work views" })).toBeInTheDocument();
  });
});

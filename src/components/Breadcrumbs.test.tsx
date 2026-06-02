import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { Breadcrumbs } from "./Breadcrumbs";

describe("Breadcrumbs", () => {
  it("renders nothing when given no items", () => {
    const { container } = render(<Breadcrumbs items={[]} />);
    expect(container.querySelector("[data-testid='breadcrumbs']")).toBeNull();
  });

  it("renders crumbs with the last as the current page (non-link, aria-current)", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "Home", href: "/dashboard" },
          { label: "AI Workflow", href: "/ai/impact" },
          { label: "AI Automations" },
        ]}
      />,
    );

    const home = screen.getByRole("link", { name: "Home" });
    expect(home).toHaveAttribute("href", "/dashboard");

    const current = screen.getByText("AI Automations");
    expect(current.tagName).toBe("SPAN");
    expect(current).toHaveAttribute("aria-current", "page");
    // The current page must never be a link.
    expect(screen.queryByRole("link", { name: "AI Automations" })).toBeNull();
  });

  it("exposes an accessible Breadcrumb landmark", () => {
    render(<Breadcrumbs items={[{ label: "Home", href: "/dashboard" }, { label: "Admin" }]} />);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
  });
});

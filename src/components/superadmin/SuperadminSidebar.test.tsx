import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SuperadminSidebar } from "./SuperadminSidebar";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/superadmin",
}));

describe("SuperadminSidebar", () => {
  it("shows 'Return to org admin' link when canAccessOrgAdmin is true", () => {
    render(<SuperadminSidebar canAccessOrgAdmin={true} />);
    expect(screen.getByText(/Return to/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /org admin/i })).toBeInTheDocument();
  });

  it("hides 'Return to org admin' link when canAccessOrgAdmin is false", () => {
    render(<SuperadminSidebar canAccessOrgAdmin={false} />);
    expect(screen.queryByText(/Return to/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /org admin/i })).not.toBeInTheDocument();
  });

  it("hides 'Return to org admin' link by default", () => {
    render(<SuperadminSidebar />);
    expect(screen.queryByText(/Return to/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /org admin/i })).not.toBeInTheDocument();
  });
});

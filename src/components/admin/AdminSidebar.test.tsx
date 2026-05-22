import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

import { AdminSidebar } from "./AdminSidebar";

let pathname = "/admin";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/navigation/OrgSwitcher", () => ({
  OrgSwitcher: () => <div data-testid="org-switcher">Org switcher</div>,
}));

describe("AdminSidebar", () => {
  beforeEach(() => {
    pathname = "/admin";
  });

  it("renders without crashing and highlights the current route", () => {
    render(<AdminSidebar />);

    expect(screen.getByText("Full Chaos Dev Health Ops")).toBeInTheDocument();
    expect(screen.getByTestId("org-switcher")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /dashboardoverview/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("renders superuser mode with platform admin links and hides organization nav", () => {
    render(<AdminSidebar isSuperuser={true} />);

    expect(screen.getAllByText("Platform Admin")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /platform adminglobal/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /organizationsettings/i })).not.toBeInTheDocument();
  });

  it("handles feature flags by including enabled admin links only", () => {
    render(
      <AdminSidebar
        features={{
          audit_log: true,
          ip_allowlist: false,
          retention_policies: true,
        }}
      />,
    );

    expect(screen.getByRole("link", { name: /audit logsenterprise/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /retentioncompliance/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /ip allowlistsecurity/i })).not.toBeInTheDocument();
  });
});

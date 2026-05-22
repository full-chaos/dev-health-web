import { render, screen } from "@/test/utils";
import { describe, expect, it, vi } from "vitest";

import { ImportTeamsDialog } from "./ImportTeamsDialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/admin/server", () => ({
  discoverTeams: vi.fn(),
  importTeams: vi.fn(),
}));

describe("ImportTeamsDialog", () => {
  it("renders the import button", () => {
    render(<ImportTeamsDialog />);
    expect(screen.getByRole("button", { name: /import teams/i })).toBeInTheDocument();
  });

  it("shows all four providers including Linear when dialog is opened", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<ImportTeamsDialog />);

    await user.click(screen.getByRole("button", { name: /import teams/i }));

    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("GitLab")).toBeInTheDocument();
    expect(screen.getByText("Jira")).toBeInTheDocument();
    expect(screen.getByText("Linear")).toBeInTheDocument();
  });

  it("shows Linear provider description", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<ImportTeamsDialog />);

    await user.click(screen.getByRole("button", { name: /import teams/i }));

    expect(screen.getByText(/discover teams from your linear workspace/i)).toBeInTheDocument();
  });

  it("shows exactly four provider options", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<ImportTeamsDialog />);

    await user.click(screen.getByRole("button", { name: /import teams/i }));

    const providerNames = ["GitHub", "GitLab", "Jira", "Linear"];
    for (const name of providerNames) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });
});

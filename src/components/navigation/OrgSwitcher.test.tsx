import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "@/test/utils";
import { OrgSwitcher } from "./OrgSwitcher";

const mockRefresh = vi.fn();
const mockUpdate = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { org_id: "org-empty" } },
    update: mockUpdate,
  }),
}));

describe("OrgSwitcher", () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    mockUpdate.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/auth/organizations") {
          return Response.json({
            active_org_id: "org-empty",
            organizations: [
              {
                id: "org-empty",
                slug: "empty",
                name: "Empty Org",
                tier: "community",
                role: "member",
                has_data: false,
                last_metrics_at: null,
              },
              {
                id: "org-data",
                slug: "data",
                name: "Data Org",
                tier: "team",
                role: "admin",
                has_data: true,
                last_metrics_at: "2026-05-02T00:00:00Z",
              },
            ],
          });
        }
        return Response.json({
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 3600,
          user: {
            org_id: "org-data",
            role: "admin",
            is_superuser: false,
          },
        });
      })
    );
  });

  it("shows data state and updates the session when switching organizations", async () => {
    render(<OrgSwitcher />);

    const select = await screen.findByLabelText(/organization/i);
    expect(screen.getByText(/no data yet/i)).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "org-data" } });

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ activeOrg: expect.any(Object) })));
    expect(mockRefresh).toHaveBeenCalled();
  });
});

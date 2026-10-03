import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "@/test/utils";
import { OrgSwitcher, describeOrganizationData } from "./OrgSwitcher";

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
            }),
        );
    });

    it("shows data state and updates the session when switching organizations", async () => {
        render(<OrgSwitcher />);

        const select = await screen.findByLabelText(/organization/i);
        expect(screen.getByText("Organization workspace")).toBeInTheDocument();
        // The data line lives under the account name now, not in this card.
        expect(screen.queryByText(/no data yet/i)).toBeNull();
        // Prototype `.workspace`: an initials mark, the name in the select, one line under it.
        expect(screen.getByTestId("org-mark")).toHaveTextContent("EO");
        expect(screen.getByRole("option", { name: "Data Org" })).toBeInTheDocument();
        expect(select.className).toContain("border-0");
        expect(screen.getByText("Organization")).toHaveClass("sr-only");

        fireEvent.change(select, { target: { value: "org-data" } });

        await waitFor(() =>
            expect(mockUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ activeOrg: expect.any(Object) }),
            ),
        );
        expect(mockRefresh).toHaveBeenCalled();
    });

    it("shows the current organization even when there is nothing to switch", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json({
                    active_org_id: "org-empty",
                    organizations: [
                        {
                            id: "org-empty",
                            slug: "empty",
                            name: "Empty Org",
                            tier: "community",
                            role: "admin",
                            has_data: false,
                            last_metrics_at: null,
                        },
                    ],
                }),
            ),
        );

        render(<OrgSwitcher />);

        const select = await screen.findByLabelText(/current organization/i);
        expect(select).toBeDisabled();
        expect(screen.getByText(/only one on this account/i)).toBeInTheDocument();
    });
});

describe("describeOrganizationData", () => {
    it("keeps unknown, empty and loaded apart (missing is not healthy)", () => {
        expect(describeOrganizationData(undefined)).toBeNull();
        expect(describeOrganizationData(null)).toBe("Data status unavailable");
        expect(describeOrganizationData({ name: "A", hasData: false, lastMetricsAt: null })).toBe(
            "No data yet",
        );
        expect(describeOrganizationData({ name: "A", hasData: true, lastMetricsAt: null })).toBe(
            "Has data",
        );
        expect(
            describeOrganizationData({
                name: "A",
                hasData: true,
                lastMetricsAt: "2026-05-02T12:00:00Z",
            }),
        ).toMatch(/^Data through /);
    });

    it("a timestamp that is not a date never prints 'Data through Invalid Date'", () => {
        const text = describeOrganizationData({
            name: "A",
            hasData: true,
            lastMetricsAt: "soon",
        });
        expect(text).toBe("Has data");
    });
});

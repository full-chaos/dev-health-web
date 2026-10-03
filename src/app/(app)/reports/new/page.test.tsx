import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@/test/utils";

import NewReportPage from "./page";

const push = vi.fn();
const orgIdRef = vi.hoisted(() => ({ current: "org-session-1" as string | null }));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => orgIdRef.current }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push }),
    usePathname: () => "/reports/new",
    useSearchParams: () => new URLSearchParams(),
}));

const createSavedReport = vi.fn();
vi.mock("@/lib/reports/fetchers", () => ({
    createSavedReport: (...args: unknown[]) => createSavedReport(...args),
}));

beforeEach(() => {
    vi.clearAllMocks();
    orgIdRef.current = "org-session-1";
});

describe("New report form (CHAOS-8096)", () => {
    it("has the footer Cancel link and a primary Create Report button", () => {
        render(<NewReportPage />);

        expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/reports");
        const submit = screen.getByRole("button", { name: "Create report" });
        expect(submit).toHaveAttribute("type", "submit");
        expect(submit.className).toContain("bg-(--action)");
    });

    it("creates the report in the signed-in session's org, never a literal org id", async () => {
        createSavedReport.mockResolvedValue({ id: "new" });
        render(<NewReportPage />);

        fireEvent.change(screen.getByLabelText("Report Name"), { target: { value: "R" } });
        await act(async () => {
            fireEvent.submit(
                screen.getByRole("button", { name: "Create report" }).closest("form")!,
            );
        });

        expect(createSavedReport).toHaveBeenCalledTimes(1);
        expect(createSavedReport.mock.calls[0][0]).toBe("org-session-1");
    });

    it("shows a failed create as a danger notice, not a free-standing banner", async () => {
        createSavedReport.mockRejectedValue(new Error("Could not create"));
        render(<NewReportPage />);

        fireEvent.change(screen.getByLabelText("Report Name"), { target: { value: "R" } });
        await act(async () => {
            fireEvent.submit(
                screen.getByRole("button", { name: "Create report" }).closest("form")!,
            );
        });

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("The change was not saved. Try again.");
        expect(alert).not.toHaveTextContent("Could not create");
        expect(alert).toHaveAttribute("data-notice-variant", "danger");
        expect(push).not.toHaveBeenCalled();
    });
});

describe("New report form without a session org (CHAOS-8213)", () => {
    it("makes no request until the session org is there", async () => {
        orgIdRef.current = null;
        render(<NewReportPage />);

        fireEvent.change(screen.getByLabelText("Report Name"), { target: { value: "R" } });
        await act(async () => {
            fireEvent.submit(
                screen.getByRole("button", { name: "Create report" }).closest("form")!,
            );
        });

        expect(createSavedReport).not.toHaveBeenCalled();
    });
});

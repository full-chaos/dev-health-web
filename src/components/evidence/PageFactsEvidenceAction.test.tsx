import { screen, userEvent, waitFor, within } from "@/test/utils";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { describe, expect, it, vi } from "vitest";

import { PageHeader } from "@/components/shell/PageHeader";

import { PageFactsEvidenceAction } from "./PageFactsEvidenceAction";

vi.mock("next/navigation", () => ({
    usePathname: () => "/plan",
    useSearchParams: () => new URLSearchParams(),
}));

const page = (facts: { label: string; value?: string }[]) =>
    render(
        <PageHeader
            title="Overview"
            actions={<PageFactsEvidenceAction title="Plan overview" facts={facts} />}
        />,
    );

describe("PageFactsEvidenceAction", () => {
    it("opens the shared drawer with the page's values as fact rows", async () => {
        page([
            { label: "Open items", value: "51" },
            { label: "P50 forecast", value: "1 week" },
        ]);

        await userEvent.click(screen.getByRole("button", { name: "View evidence" }));

        const facts = await screen.findByTestId("page-evidence-facts");
        const rows = within(facts)
            .getAllByTestId("evidence-fact")
            .map((row) => [
                row.querySelector("dt")?.textContent,
                row.querySelector("dd")?.textContent,
            ]);
        expect(rows).toEqual([
            ["Open items", "51"],
            ["P50 forecast", "1 week"],
        ]);
    });

    it("reads 'Not reported' for a value that was not served, never a number", async () => {
        page([{ label: "P75 forecast" }]);

        await userEvent.click(screen.getByRole("button", { name: "View evidence" }));

        const row = within(await screen.findByTestId("page-evidence-facts")).getByTestId(
            "evidence-fact",
        );
        expect(row).toHaveAttribute("data-reported", "false");
        expect(row).toHaveTextContent("Unknown");
        await waitFor(() => expect(screen.getAllByRole("dialog").length).toBeGreaterThan(0));
    });
});

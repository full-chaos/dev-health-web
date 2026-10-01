import { describe, it, expect, vi } from "vitest";

import { DataTable, type DataTableColumn } from "./DataTable";
import { render, screen, userEvent } from "@/test/utils";

type Row = { id: string; name: string; size: number };
const ROWS: Row[] = [
    { id: "a", name: "Alpha", size: 1 },
    { id: "b", name: "Beta", size: 2 },
];
const COLUMNS: DataTableColumn<Row>[] = [
    { key: "name", header: "Name", render: (r) => r.name },
    { key: "size", header: "Size", render: (r) => String(r.size) },
];

const base = {
    accessibleLabel: "Things",
    columns: COLUMNS,
    data: ROWS,
    rowKeyAction: (r: Row) => r.id,
    emptyMessage: "Nothing here",
};

describe("DataTable baseline (behaviour before the row-action and footer props)", () => {
    it("renders a labelled region, headers and one row per item", () => {
        render(<DataTable {...base} />);
        expect(screen.getByRole("region", { name: "Things" })).toBeInTheDocument();
        expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
            "Name",
            "Size",
        ]);
        expect(screen.getByText("Alpha")).toBeInTheDocument();
        expect(screen.getByText("Beta")).toBeInTheDocument();
        expect(screen.getAllByRole("row")).toHaveLength(3);
    });

    it("shows the empty message spanning all columns", () => {
        render(<DataTable {...base} data={[]} />);
        const cell = screen.getByText("Nothing here");
        expect(cell).toHaveAttribute("colspan", "2");
    });

    it("honors emptyColSpan", () => {
        render(<DataTable {...base} data={[]} emptyColSpan={5} />);
        expect(screen.getByText("Nothing here")).toHaveAttribute("colspan", "5");
    });

    it("renders the page summary and moves pages with Previous / Next", async () => {
        const onPage = vi.fn();
        render(
            <DataTable
                {...base}
                summaryLabel="things"
                pagination={{ limit: 10, offset: 10, total: 35 }}
                onPageChangeAction={onPage}
            />,
        );
        expect(screen.getByText(/Page 2 of 4 \(35\s+things\)/)).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Next" }));
        expect(onPage).toHaveBeenLastCalledWith(20);
        await userEvent.click(screen.getByRole("button", { name: "Previous" }));
        expect(onPage).toHaveBeenLastCalledWith(0);
    });

    it("disables Previous on the first page and Next on the last", () => {
        const { rerender } = render(
            <DataTable
                {...base}
                pagination={{ limit: 10, offset: 0, total: 35 }}
                onPageChangeAction={() => {}}
            />,
        );
        expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
        rerender(
            <DataTable
                {...base}
                pagination={{ limit: 10, offset: 30, total: 35 }}
                onPageChangeAction={() => {}}
            />,
        );
        expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    });

    it("submits the search value and reports typing", async () => {
        const onSearch = vi.fn();
        const onChange = vi.fn();
        render(
            <DataTable
                {...base}
                search={{ value: "al", placeholder: "Find" }}
                onSearchAction={onSearch}
                onSearchChangeAction={onChange}
            />,
        );
        await userEvent.type(screen.getByPlaceholderText("Find"), "x");
        expect(onChange).toHaveBeenCalled();
        await userEvent.click(screen.getByRole("button", { name: "Filter" }));
        expect(onSearch).toHaveBeenCalledWith("al");
    });

    it("renders the toolbar", () => {
        render(<DataTable {...base} toolbar={<span>tools</span>} />);
        expect(screen.getByText("tools")).toBeInTheDocument();
    });

    it("lets renderRowAction render the whole row", () => {
        render(
            <DataTable
                {...base}
                renderRowAction={(r) => (
                    <tr data-testid={`custom-${r.id}`}>
                        <td colSpan={2}>custom {r.name}</td>
                    </tr>
                )}
            />,
        );
        expect(screen.getByTestId("custom-a")).toHaveTextContent("custom Alpha");
        expect(screen.getByTestId("custom-b")).toBeInTheDocument();
    });

    it("has no footer strip and no actions column", () => {
        const { container } = render(<DataTable {...base} />);
        expect(container.querySelectorAll("th")).toHaveLength(2);
        expect(container.querySelector("[data-table-footer]")).toBeNull();
    });

    it("markup of a full configuration (snapshot taken before the new props existed)", () => {
        const { container } = render(
            <DataTable
                {...base}
                summaryLabel="things"
                pagination={{ limit: 1, offset: 0, total: 2 }}
                onPageChangeAction={() => {}}
                search={{ value: "" }}
                onSearchAction={() => {}}
                toolbar={<span>tools</span>}
            />,
        );
        expect(container.innerHTML).toMatchSnapshot();
    });
});

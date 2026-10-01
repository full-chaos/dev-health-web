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

describe("DataTable rowActions and footerNote (CHAOS-7599)", () => {
    it("adds one trailing cell per row with the row's own action and an Actions header", () => {
        const { container } = render(
            <DataTable
                {...base}
                rowActions={(r) => <button type="button">Open {r.name}</button>}
            />,
        );
        expect(screen.getByRole("columnheader", { name: "Actions" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Open Alpha" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Open Beta" })).toBeInTheDocument();
        const rows = container.querySelectorAll("tbody tr");
        rows.forEach((tr) => expect(tr.querySelectorAll("td")).toHaveLength(3));
    });

    it("keeps the action visible (no hover-only class) and does not make the row a link", () => {
        const { container } = render(
            <DataTable {...base} rowActions={() => <button type="button">Go</button>} />,
        );
        expect(container.innerHTML).not.toMatch(/group-hover|opacity-0|invisible/);
        expect(container.querySelector("tbody tr a")).toBeNull();
    });

    it("widens the empty row by the actions column, unless emptyColSpan is given", () => {
        const { rerender } = render(
            <DataTable {...base} data={[]} rowActions={() => <span>x</span>} />,
        );
        expect(screen.getByText("Nothing here")).toHaveAttribute("colspan", "3");
        rerender(
            <DataTable {...base} data={[]} emptyColSpan={7} rowActions={() => <span>x</span>} />,
        );
        expect(screen.getByText("Nothing here")).toHaveAttribute("colspan", "7");
    });

    it("ignores rowActions when renderRowAction renders the whole row", () => {
        const { container } = render(
            <DataTable
                {...base}
                renderRowAction={(r) => (
                    <tr>
                        <td>{r.name}</td>
                    </tr>
                )}
                rowActions={() => <button type="button">Never</button>}
            />,
        );
        expect(screen.queryByRole("button", { name: "Never" })).toBeNull();
        expect(container.querySelectorAll("tbody tr td")).toHaveLength(2);
    });

    it("shows the footer note under the table and leaves the pager as it was", () => {
        const { container } = render(
            <DataTable
                {...base}
                footerNote={<span>Last computed 12:03</span>}
                summaryLabel="things"
                pagination={{ limit: 1, offset: 0, total: 2 }}
                onPageChangeAction={() => {}}
            />,
        );
        const footer = container.querySelector("[data-table-footer]") as HTMLElement;
        expect(footer).toHaveTextContent("Last computed 12:03");
        const region = screen.getByRole("region", { name: "Things" });
        expect(
            region.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    });
});

describe("DataTable concept shell (CHAOS-7725)", () => {
    it("uses the radius token and the caps header on the page background", () => {
        const { container } = render(<DataTable {...base} />);
        expect(screen.getByRole("region", { name: "Things" }).className).toContain(
            "rounded-(--radius-md)",
        );
        const thead = container.querySelector("thead") as HTMLElement;
        expect(thead.className).toContain("text-label-caps");
        expect(thead.className).toContain("uppercase");
        expect(thead.className).toContain("bg-background");
    });

    it("rows hover to the page background, with hairlines between rows only", () => {
        const { container } = render(<DataTable {...base} />);
        expect(container.querySelector("tbody")?.className).toContain("divide-y");
        expect(container.querySelector("tbody tr")?.className).toContain("hover:bg-background");
    });

    it("default cell padding is the concept's; a caller's own className still replaces it", () => {
        const cols: DataTableColumn<Row>[] = [
            { key: "name", header: "Name", render: (r) => r.name },
            {
                key: "size",
                header: "Size",
                render: (r) => String(r.size),
                className: "px-6 py-4",
                headerClassName: "px-6 py-4 font-medium",
            },
        ];
        const { container } = render(<DataTable {...base} columns={cols} />);
        const tds = container.querySelectorAll("tbody tr:first-child td");
        expect(tds[0].className).toContain("px-3");
        expect(tds[1].className).toContain("px-6");
        expect(tds[1].className).not.toContain("px-3");
    });

    it("numeric right-aligns tabular figures in the header and the cells, and is off by default", () => {
        const cols: DataTableColumn<Row>[] = [
            { key: "name", header: "Name", render: (r) => r.name },
            { key: "size", header: "Size", render: (r) => String(r.size), numeric: true },
        ];
        const { container } = render(<DataTable {...base} columns={cols} />);
        const ths = container.querySelectorAll("th");
        expect(ths[0].className).not.toContain("text-right");
        expect(ths[1].className).toContain("text-right");
        expect(ths[1].className).toContain("tabular-nums");
        const tds = container.querySelectorAll("tbody tr:first-child td");
        expect(tds[0].className).not.toContain("tabular-nums");
        expect(tds[1].className).toContain("text-right");
    });

    it("numeric keeps a caller's own cell classes and adds the alignment", () => {
        const cols: DataTableColumn<Row>[] = [
            {
                key: "size",
                header: "Size",
                render: (r) => String(r.size),
                className: "px-4 py-3 text-foreground",
                numeric: true,
            },
        ];
        const { container } = render(<DataTable {...base} columns={cols} />);
        const td = container.querySelector("tbody td") as HTMLElement;
        expect(td.className).toContain("text-foreground");
        expect(td.className).toContain("text-right");
    });
});

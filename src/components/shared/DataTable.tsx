"use client";

import { Fragment, type ReactNode } from "react";
import { CTA_LABELS } from "@/lib/design/cta";

export type DataTableColumn<T> = {
    key: string;
    header: ReactNode;
    render: (row: T) => ReactNode;
    className?: string;
    headerClassName?: string;
    /** Right-aligned tabular figures for this column (header and cells). Opt in per column. */
    numeric?: boolean;
};

const NUMERIC_CLASSES = "text-right tabular-nums";
const withNumeric = (base: string, numeric?: boolean) =>
    numeric ? `${base} ${NUMERIC_CLASSES}` : base;

type DataTablePagination = {
    limit: number;
    offset: number;
    total: number;
};

type DataTableSearch = {
    value: string;
    placeholder?: string;
    buttonLabel?: string;
};

type DataTableProps<T> = {
    accessibleLabel: string;
    columns: readonly DataTableColumn<T>[];
    data: readonly T[];
    rowKeyAction: (row: T) => string;
    /** Renders the WHOLE `<tr>` for a row (the caller owns every cell). Not the same as `rowActions`. */
    renderRowAction?: (row: T) => ReactNode;
    /**
     * Content of one extra, always-visible trailing cell per row (for example an "Open evidence"
     * button). DataTable adds the cell and a visually hidden "Actions" header; the caller supplies the
     * control. Unlike `renderRowAction` it does not replace the row; it is ignored when
     * `renderRowAction` is used.
     */
    rowActions?: (row: T) => ReactNode;
    /**
     * Provenance or data-source note shown in a footer strip under the table (for example
     * "Last computed 12:03 from the daily rollups"). Separate from the pager: the page summary
     * and Previous / Next keep their place and text.
     */
    footerNote?: ReactNode;
    emptyMessage: string;
    emptyColSpan?: number;
    pagination?: DataTablePagination;
    search?: DataTableSearch;
    onPageChangeAction?: (offset: number) => void;
    onSearchAction?: (value: string) => void;
    onSearchChangeAction?: (value: string) => void;
    isPending?: boolean;
    summaryLabel?: string;
    toolbar?: ReactNode;
    /** Test hook: `data-testid` of the `<table>`. No attribute when it is not given. */
    testId?: string;
    /** Test hook: `data-testid` of each data `<tr>` (not used with `renderRowAction`). No attribute when it is not given. */
    rowTestId?: string;
};

export function DataTable<T>({
    accessibleLabel,
    columns,
    data,
    rowKeyAction,
    renderRowAction,
    rowActions,
    footerNote,
    emptyMessage,
    emptyColSpan,
    pagination,
    search,
    onPageChangeAction,
    onSearchAction,
    onSearchChangeAction,
    isPending = false,
    summaryLabel,
    toolbar,
    testId,
    rowTestId,
}: DataTableProps<T>) {
    const totalPages = pagination
        ? pagination.limit <= 0
            ? 1
            : Math.max(1, Math.ceil(pagination.total / pagination.limit))
        : 1;

    const currentPage = pagination
        ? pagination.limit <= 0
            ? 1
            : Math.floor(pagination.offset / pagination.limit) + 1
        : 1;

    const showHeader = Boolean(search || pagination || toolbar);
    const colSpan = emptyColSpan ?? columns.length + (rowActions ? 1 : 0);

    return (
        <>
            {showHeader && (
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        {search && onSearchAction && (
                            <form
                                className="flex items-center gap-2"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    onSearchAction(search.value);
                                }}
                            >
                                <input
                                    type="search"
                                    value={search.value}
                                    onChange={(event) => onSearchChangeAction?.(event.target.value)}
                                    placeholder={search.placeholder ?? "Search"}
                                    className="rounded-md border border-(--card-stroke) bg-(--card-60) px-2 py-1 text-sm text-foreground"
                                />
                                <button
                                    type="submit"
                                    className="rounded-md border border-(--card-stroke) px-2.5 py-1 text-xs font-medium text-foreground hover:bg-(--card-70)"
                                >
                                    {search.buttonLabel ?? "Filter"}
                                </button>
                            </form>
                        )}
                        {toolbar}
                    </div>

                    {pagination && (
                        <p className="text-sm text-(--ink-muted)">
                            Page {currentPage} of {totalPages} ({pagination.total}{" "}
                            {summaryLabel ?? "items"})
                        </p>
                    )}
                </div>
            )}

            <div
                role="region"
                aria-label={accessibleLabel}
                tabIndex={0}
                className="overflow-x-auto rounded-(--radius-md) border border-(--card-stroke) bg-(--card-80)"
            >
                <table className="w-full text-left text-sm" data-testid={testId}>
                    {/* Concept `th`: caps label on the page background. The type scale rules (label-caps 11/16,
                        design-system C1), not the concept's 9px. Callers' own `headerClassName`
                        only sets padding and weight, so this cascades to every column. */}
                    <thead className="whitespace-nowrap border-b border-(--card-stroke) bg-background text-label-caps uppercase text-(--ink-muted)">
                        <tr>
                            {columns.map((column) => (
                                <th
                                    key={column.key}
                                    className={withNumeric(
                                        column.headerClassName ?? "px-3 py-2.75 font-medium",
                                        column.numeric,
                                    )}
                                >
                                    {column.header}
                                </th>
                            ))}
                            {rowActions && (
                                <th className="px-4 py-3 font-medium">
                                    <span className="sr-only">Actions</span>
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-(--card-stroke)">
                        {data.map((row) => {
                            const key = rowKeyAction(row);
                            if (renderRowAction) {
                                return <Fragment key={key}>{renderRowAction(row)}</Fragment>;
                            }
                            return (
                                <tr
                                    className="transition-colors hover:bg-background"
                                    key={key}
                                    data-testid={rowTestId}
                                >
                                    {columns.map((column) => (
                                        <td
                                            key={column.key}
                                            className={withNumeric(
                                                column.className ?? "px-3 py-3.25",
                                                column.numeric,
                                            )}
                                        >
                                            {column.render(row)}
                                        </td>
                                    ))}
                                    {rowActions && (
                                        <td className="whitespace-nowrap px-4 py-3 text-right">
                                            {rowActions(row)}
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                        {data.length === 0 && (
                            <tr>
                                <td
                                    colSpan={colSpan}
                                    className="px-4 py-12 text-center text-(--ink-muted)"
                                >
                                    {emptyMessage}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {footerNote && (
                <div
                    data-table-footer
                    className="mt-2 flex flex-wrap items-center gap-2 border-t border-(--card-stroke) pt-3 text-xs text-(--ink-muted)"
                >
                    {footerNote}
                </div>
            )}

            {pagination && onPageChangeAction && (
                <div className="mt-4 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={() =>
                            onPageChangeAction(Math.max(0, pagination.offset - pagination.limit))
                        }
                        disabled={isPending || pagination.offset === 0}
                        className="rounded-md border border-(--card-stroke) px-3 py-1.5 text-sm disabled:opacity-50"
                    >
                        {CTA_LABELS.previousPage}
                    </button>
                    <button
                        type="button"
                        onClick={() => onPageChangeAction(pagination.offset + pagination.limit)}
                        disabled={isPending || currentPage >= totalPages}
                        className="rounded-md border border-(--card-stroke) px-3 py-1.5 text-sm disabled:opacity-50"
                    >
                        {CTA_LABELS.nextPage}
                    </button>
                </div>
            )}
        </>
    );
}

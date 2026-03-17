"use client";

import type { ReactNode } from "react";

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
};

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
  columns: DataTableColumn<T>[];
  data: T[];
  rowKeyAction: (row: T) => string;
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
};

export function DataTable<T>({
  columns,
  data,
  rowKeyAction,
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
  const colSpan = emptyColSpan ?? columns.length;

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
              Page {currentPage} of {totalPages} ({pagination.total} {summaryLabel ?? "items"})
            </p>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-(--card-stroke) bg-(--card-80)">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-(--card-stroke) bg-(--card-70) text-(--ink-muted)">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={column.headerClassName ?? "px-4 py-3 font-medium"}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-(--card-stroke)">
            {data.map((row) => (
              <tr key={rowKeyAction(row)} className="transition-colors hover:bg-(--card-70)">
                {columns.map((column) => (
                  <td key={column.key} className={column.className ?? "px-4 py-3"}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="px-4 py-12 text-center text-(--ink-muted)">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination && onPageChangeAction && (
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onPageChangeAction(Math.max(0, pagination.offset - pagination.limit))}
            disabled={isPending || pagination.offset === 0}
            className="rounded-md border border-(--card-stroke) px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => onPageChangeAction(pagination.offset + pagination.limit)}
            disabled={isPending || currentPage >= totalPages}
            className="rounded-md border border-(--card-stroke) px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}

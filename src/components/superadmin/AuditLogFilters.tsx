"use client";

import React, { useState } from "react";
import type { AuditLogFilter } from "@/lib/admin/types";

type AuditLogFiltersProps = {
  onFilter: (filters: AuditLogFilter) => void;
};

export function AuditLogFilters({ onFilter }: AuditLogFiltersProps) {
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onFilter({
      action: action || undefined,
      resource_type: resourceType || undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 grid gap-4 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-4 sm:grid-cols-2 lg:grid-cols-5"
    >
      <div>
        <label htmlFor="action-filter" className="mb-1 block text-xs font-medium text-(--ink-muted)">
          Action
        </label>
        <input
          id="action-filter"
          type="text"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="e.g. org.create"
          className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="resource-filter" className="mb-1 block text-xs font-medium text-(--ink-muted)">
          Resource Type
        </label>
        <input
          id="resource-filter"
          type="text"
          value={resourceType}
          onChange={(e) => setResourceType(e.target.value)}
          placeholder="e.g. organization"
          className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="start-date" className="mb-1 block text-xs font-medium text-(--ink-muted)">
          Start Date
        </label>
        <input
          id="start-date"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="end-date" className="mb-1 block text-xs font-medium text-(--ink-muted)">
          End Date
        </label>
        <input
          id="end-date"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none"
        />
      </div>
      <div className="flex items-end">
        <button
          type="submit"
          className="w-full rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90"
        >
          Search
        </button>
      </div>
    </form>
  );
}

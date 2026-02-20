"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import {
  listIPAllowlistEntries,
  createIPAllowlistEntry,
  updateIPAllowlistEntry,
  deleteIPAllowlistEntry,
} from "@/lib/admin/server";
import type { IPAllowlist, IPAllowlistCreate } from "@/lib/admin/types";
import { UpgradeGate } from "@/components/billing/UpgradeGate";

export default function IPAllowlistPage() {
  const [entries, setEntries] = useState<IPAllowlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<IPAllowlistCreate>({ ip_range: "" });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: apiError } = await listIPAllowlistEntries(limit, offset);
      if (apiError) {
        setError(apiError);
      } else if (data) {
        setEntries(data.items);
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleCreate = async () => {
    if (!formData.ip_range.trim()) return;
    setSaving(true);
    const { error: apiError } = await createIPAllowlistEntry(formData);
    setSaving(false);
    if (apiError) {
      setError(apiError);
    } else {
      setShowAddForm(false);
      setFormData({ ip_range: "" });
      fetchEntries();
    }
  };

  const handleToggle = async (entry: IPAllowlist) => {
    setTogglingId(entry.id);
    const { error: apiError } = await updateIPAllowlistEntry(entry.id, {
      is_active: !entry.is_active,
    });
    setTogglingId(null);
    if (apiError) {
      setError(apiError);
    } else {
      fetchEntries();
    }
  };

  const handleDelete = async (id: string) => {
    if (deletingId === id) {
      const { error: apiError } = await deleteIPAllowlistEntry(id);
      setDeletingId(null);
      if (apiError) {
        setError(apiError);
      } else {
        fetchEntries();
      }
    } else {
      setDeletingId(id);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return "--";
    return new Date(d).toLocaleDateString();
  };

  return (
    <UpgradeGate
      feature="ip_allowlist"
      requiredTier="enterprise"
    >
      <div>
        <AdminHeader
          title="IP Allowlist"
          description="Manage allowed IP addresses and CIDR ranges for your organization."
        />

        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-500">
            {error}
          </div>
        )}

        <div className="mb-6">
          {showAddForm ? (
            <div className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--ink-muted)">
                    IP Range
                  </label>
                  <input
                    type="text"
                    placeholder="192.168.1.0/24"
                    value={formData.ip_range}
                    onChange={(e) => setFormData({ ...formData, ip_range: e.target.value })}
                    className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--ink-muted)">
                    Description
                  </label>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={formData.description ?? ""}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value || null })
                    }
                    className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--ink-muted)">
                    Expires At
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.expires_at ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        expires_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                      })
                    }
                    className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none"
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={saving}
                  className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setFormData({ ip_range: "" });
                  }}
                  className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white"
            >
              Add IP Rule
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center text-(--ink-muted)">Loading IP allowlist...</div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl border border-(--card-stroke) bg-(--card-80)">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-(--card-stroke) bg-(--card-70) text-(--ink-muted)">
                    <th className="px-4 py-3 text-left font-medium">IP Range</th>
                    <th className="px-4 py-3 text-left font-medium">Description</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Created</th>
                    <th className="px-4 py-3 text-left font-medium">Expires</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-(--ink-muted)">
                        No IP allowlist entries configured.
                      </td>
                    </tr>
                  ) : (
                    entries.map((entry) => (
                      <tr key={entry.id} className="border-b border-(--card-stroke) last:border-0">
                        <td className="px-4 py-3 font-mono text-xs">{entry.ip_range}</td>
                        <td className="px-4 py-3 text-(--ink-muted)">{entry.description ?? "--"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              entry.is_active
                                ? "bg-green-500/10 text-green-500"
                                : "bg-red-500/10 text-red-500"
                            }`}
                          >
                            {entry.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-(--ink-muted)">{formatDate(entry.created_at)}</td>
                        <td className="px-4 py-3 text-(--ink-muted)">{formatDate(entry.expires_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggle(entry)}
                              disabled={togglingId === entry.id}
                              className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-1 text-xs font-medium disabled:opacity-50"
                            >
                              {entry.is_active ? "Disable" : "Enable"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(entry.id)}
                              className="rounded-lg bg-red-500/10 px-3 py-1 text-xs font-medium text-red-500"
                            >
                              {deletingId === entry.id ? "Confirm?" : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
                disabled={offset === 0}
                className="rounded-lg border border-(--card-stroke) bg-(--card-80) px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-(--ink-muted)">
                Showing {offset + 1}-{offset + entries.length}
              </span>
              <button
                type="button"
                onClick={() => setOffset((prev) => prev + limit)}
                disabled={entries.length < limit}
                className="rounded-lg border border-(--card-stroke) bg-(--card-80) px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </UpgradeGate>
  );
}

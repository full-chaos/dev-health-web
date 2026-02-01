"use client";

import { useState } from "react";
import { SettingsSection } from "./SettingsSection";

type DangerZoneProps = {
  orgName?: string;
};

export function DangerZone({ orgName }: DangerZoneProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const handleDelete = () => {
    if (confirmText === orgName) {
      alert("Organization deletion is not implemented yet.");
    }
  };

  return (
    <SettingsSection
      title="Danger Zone"
      description="Irreversible actions for your organization."
      danger
    >
      {!showConfirm ? (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-(--foreground)">Delete Organization</p>
            <p className="text-sm text-(--ink-muted)">
              Once you delete an organization, there is no going back. Please be certain.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            Delete Organization
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-(--foreground)">
            Type <strong>{orgName}</strong> to confirm deletion:
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Organization name"
            className="block w-full rounded-md border border-red-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setShowConfirm(false);
                setConfirmText("");
              }}
              className="rounded-md border border-(--card-stroke) px-4 py-2 text-sm font-medium text-(--foreground) hover:bg-(--card-70)"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={confirmText !== orgName}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
            >
              Delete Forever
            </button>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}

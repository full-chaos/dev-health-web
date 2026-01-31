import React from "react";
import { SettingsSection } from "./SettingsSection";

export function DangerZone() {
  return (
    <SettingsSection
      title="Danger Zone"
      description="Irreversible actions for your organization."
      danger
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-(--foreground)">Delete Organization</p>
          <p className="text-sm text-(--ink-muted)">
            Once you delete an organization, there is no going back. Please be certain.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        >
          Delete Organization
        </button>
      </div>
    </SettingsSection>
  );
}

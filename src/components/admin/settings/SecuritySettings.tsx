import React from "react";
import { SettingsSection } from "./SettingsSection";

export function SecuritySettings() {
  return (
    <SettingsSection
      title="Security"
      description="Configure security settings for your organization."
    >
      <form className="space-y-4">
        <div>
          <label htmlFor="sessionTimeout" className="block text-sm font-medium text-(--foreground)">
            Session Timeout
          </label>
          <select
            id="sessionTimeout"
            name="sessionTimeout"
            defaultValue="30"
            className="mt-1 block w-full rounded-md border border-(--card-stroke) bg-(--background) px-3 py-2 text-(--foreground) shadow-sm focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
          >
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
            <option value="240">4 hours</option>
          </select>
        </div>
        <div className="flex items-center">
          <input
            id="2fa"
            name="2fa"
            type="checkbox"
            className="h-4 w-4 rounded border-(--card-stroke) text-(--accent) focus:ring-(--accent)"
          />
          <label htmlFor="2fa" className="ml-2 block text-sm text-(--foreground)">
            Enforce Two-Factor Authentication (2FA)
          </label>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 focus:outline-none focus:ring-2 focus:ring-(--accent) focus:ring-offset-2"
          >
            Save Security Settings
          </button>
        </div>
      </form>
    </SettingsSection>
  );
}

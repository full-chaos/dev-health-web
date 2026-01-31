import React from "react";
import { SettingsSection } from "./SettingsSection";

export function GeneralSettings() {
  return (
    <SettingsSection
      title="General Settings"
      description="Manage your organization's basic information."
    >
      <form className="space-y-4">
        <div>
          <label htmlFor="orgName" className="block text-sm font-medium text-(--foreground)">
            Organization Name
          </label>
          <input
            type="text"
            id="orgName"
            name="orgName"
            defaultValue="Acme Corp"
            className="mt-1 block w-full rounded-md border border-(--card-stroke) bg-(--background) px-3 py-2 text-(--foreground) shadow-sm focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
          />
        </div>
        <div>
          <label htmlFor="slug" className="block text-sm font-medium text-(--foreground)">
            Slug
          </label>
          <input
            type="text"
            id="slug"
            name="slug"
            defaultValue="acme-corp"
            disabled
            className="mt-1 block w-full rounded-md border border-(--card-stroke) bg-(--background) px-3 py-2 text-(--ink-muted) shadow-sm opacity-50 cursor-not-allowed"
          />
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-(--foreground)">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            defaultValue="The best company in the world."
            className="mt-1 block w-full rounded-md border border-(--card-stroke) bg-(--background) px-3 py-2 text-(--foreground) shadow-sm focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 focus:outline-none focus:ring-2 focus:ring-(--accent) focus:ring-offset-2"
          >
            Save Changes
          </button>
        </div>
      </form>
    </SettingsSection>
  );
}

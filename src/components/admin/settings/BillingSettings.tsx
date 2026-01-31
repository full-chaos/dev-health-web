import React from "react";
import { SettingsSection } from "./SettingsSection";

export function BillingSettings() {
  return (
    <SettingsSection
      title="Billing"
      description="Manage your subscription and billing details."
    >
      <div className="flex items-center justify-between rounded-md border border-(--card-stroke) bg-(--background) p-4">
        <div>
          <p className="text-sm font-medium text-(--foreground)">Current Plan</p>
          <p className="text-2xl font-bold text-(--foreground)">Pro</p>
        </div>
        <button
          type="button"
          className="rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 focus:outline-none focus:ring-2 focus:ring-(--accent) focus:ring-offset-2"
        >
          Upgrade Plan
        </button>
      </div>
      <div className="mt-4 text-sm text-(--ink-muted)">
        <p>Next billing date: February 28, 2026</p>
      </div>
    </SettingsSection>
  );
}

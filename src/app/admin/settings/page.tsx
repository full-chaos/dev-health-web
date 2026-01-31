import React from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { GeneralSettings } from "@/components/admin/settings/GeneralSettings";
import { BillingSettings } from "@/components/admin/settings/BillingSettings";
import { SecuritySettings } from "@/components/admin/settings/SecuritySettings";
import { DangerZone } from "@/components/admin/settings/DangerZone";

export default function OrganizationSettingsPage() {
  return (
    <div>
      <AdminHeader
        title="Organization Settings"
        description="Manage your organization's profile, billing, and security settings."
      />
      <div className="max-w-4xl">
        <GeneralSettings />
        <BillingSettings />
        <SecuritySettings />
        <DangerZone />
      </div>
    </div>
  );
}

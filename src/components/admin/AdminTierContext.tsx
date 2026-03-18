"use client";

import { createContext, useContext } from "react";

const TIER_MIN_SYNC_INTERVAL_HOURS: Record<string, number> = {
  community: 24,
  free: 24,
  team: 6,
  enterprise: 0.25,
};

type AdminTierContextValue = {
  tier: string;
  features: Record<string, boolean>;
  minSyncIntervalHours: number;
};

const AdminTierContext = createContext<AdminTierContextValue>({
  tier: "community",
  features: {},
  minSyncIntervalHours: 24,
});

export function AdminTierProvider({
  tier,
  features: backendFeatures,
  children,
}: {
  tier: string;
  features: Record<string, boolean>;
  children: React.ReactNode;
    }) {
  const features = {
    ...backendFeatures,
    initial_sync_depth: tier === "team" || tier === "enterprise",
    unlimited_sync_depth: tier === "enterprise",
  };

  const minSyncIntervalHours = TIER_MIN_SYNC_INTERVAL_HOURS[tier] ?? 24;

  return (
    <AdminTierContext.Provider value={{ tier, features, minSyncIntervalHours }}>
      {children}
    </AdminTierContext.Provider>
  );
}

export function useAdminTier(): AdminTierContextValue {
  return useContext(AdminTierContext);
}

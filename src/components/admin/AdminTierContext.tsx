"use client";

import { createContext, useContext } from "react";

type AdminTierContextValue = {
  tier: string;
  features: Record<string, boolean>;
};

const AdminTierContext = createContext<AdminTierContextValue>({
  tier: "community",
  features: {},
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

  return (
    <AdminTierContext.Provider value={{ tier, features }}>
      {children}
    </AdminTierContext.Provider>
  );
}

export function useAdminTier(): AdminTierContextValue {
  return useContext(AdminTierContext);
}

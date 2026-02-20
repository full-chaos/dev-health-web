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
  features,
  children,
}: {
  tier: string;
  features: Record<string, boolean>;
  children: React.ReactNode;
}) {
  return (
    <AdminTierContext.Provider value={{ tier, features }}>
      {children}
    </AdminTierContext.Provider>
  );
}

export function useAdminTier(): AdminTierContextValue {
  return useContext(AdminTierContext);
}

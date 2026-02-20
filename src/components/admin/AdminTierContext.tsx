"use client";

import { createContext, useContext } from "react";

type AdminTierContextValue = {
  tier: string;
};

const AdminTierContext = createContext<AdminTierContextValue>({
  tier: "community",
});

export function AdminTierProvider({
  tier,
  children,
}: {
  tier: string;
  children: React.ReactNode;
}) {
  return (
    <AdminTierContext.Provider value={{ tier }}>
      {children}
    </AdminTierContext.Provider>
  );
}

export function useAdminTier(): AdminTierContextValue {
  return useContext(AdminTierContext);
}

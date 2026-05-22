"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IdentityForm } from "@/components/admin/identities/IdentityForm";
import { Identity } from "@/components/admin/identities/IdentityTable";
import { Team } from "@/components/admin/teams/TeamTable";
import { updateIdentity } from "@/lib/admin/server";
import type { IdentityMapping } from "@/lib/admin/types";

type EditIdentityFormWrapperProps = {
  identity: IdentityMapping;
  teams: Team[];
};

export function EditIdentityFormWrapper({ identity, teams }: EditIdentityFormWrapperProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const initialData: Identity = {
    canonical_id: identity.canonical_id,
    display_name: identity.display_name,
    email: identity.email,
    team_ids: identity.team_ids,
    provider_identities: identity.provider_identities,
  };

  const handleSubmit = async (data: Identity) => {
    setIsLoading(true);

    const result = await updateIdentity(identity.id, {
      display_name: data.display_name || undefined,
      email: data.email || undefined,
      provider_identities: data.provider_identities,
      team_ids: data.team_ids,
    });

    setIsLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    router.push("/admin/identities");
    router.refresh();
  };

  return (
    <IdentityForm
      initialData={initialData}
      teams={teams}
      onSubmit={handleSubmit}
      isEditing
      isLoading={isLoading}
    />
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { IdentityForm } from "@/components/admin/identities/IdentityForm";
import { Identity } from "@/components/admin/identities/IdentityTable";
import { Team } from "@/components/admin/teams/TeamTable";
import { createIdentity, listTeams } from "@/lib/admin/server";

export default function NewIdentityPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [teams, setTeams] = useState<Team[]>([]);
    const [teamsLoading, setTeamsLoading] = useState(true);

    useEffect(() => {
        listTeams().then((result) => {
            if (result.data) {
                setTeams(
                    result.data.map((t) => ({
                        team_id: t.team_id,
                        name: t.name,
                        description: t.description,
                        repo_patterns: t.repo_patterns,
                        project_keys: t.project_keys,
                    })),
                );
            }
            setTeamsLoading(false);
        });
    }, []);

    const handleSubmit = async (data: Identity) => {
        setIsLoading(true);

        const result = await createIdentity({
            canonical_id: data.canonical_id,
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
    };

    if (teamsLoading) {
        return (
            <div>
                <AdminHeader
                    title="Add Identity"
                    description="Create a new identity and map provider accounts."
                />
                <div className="text-sm text-(--ink-muted)">Loading teams…</div>
            </div>
        );
    }

    return (
        <div>
            <AdminHeader
                title="Add Identity"
                description="Create a new identity and map provider accounts."
            />
            <IdentityForm teams={teams} onSubmit={handleSubmit} isLoading={isLoading} />
        </div>
    );
}

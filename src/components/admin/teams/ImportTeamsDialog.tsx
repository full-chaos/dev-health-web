"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { discoverTeams, importTeams } from "@/lib/admin/server";
import type { DiscoveredTeam, TeamImportResponse } from "@/lib/admin/types";

type Step = "provider" | "discovering" | "select" | "importing" | "result";

const PROVIDERS = [
    {
        id: "github",
        name: "GitHub",
        description: "Import teams and repo associations from your org",
    },
    {
        id: "gitlab",
        name: "GitLab",
        description: "Import groups and subgroups from your GitLab instance",
    },
    {
        id: "jira",
        name: "Jira",
        description: "Import projects as team units with project keys",
    },
    {
        id: "linear",
        name: "Linear",
        description: "Discover teams from your Linear workspace",
    },
];

export function ImportTeamsDialog() {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState<Step>("provider");
    const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
    const [discoveredTeams, setDiscoveredTeams] = useState<DiscoveredTeam[]>([]);
    const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
    const [onConflict, setOnConflict] = useState<"skip" | "merge">("skip");
    const [importResult, setImportResult] = useState<TeamImportResponse | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleOpen = () => {
        setIsOpen(true);
        setStep("provider");
        setSelectedProvider(null);
        setDiscoveredTeams([]);
        setSelectedTeams(new Set());
        setImportResult(null);
    };

    const handleClose = () => {
        setIsOpen(false);
    };

    const handleDiscover = (provider: string) => {
        setSelectedProvider(provider);
        setStep("discovering");

        startTransition(async () => {
            try {
                const result = await discoverTeams(provider);
                if (result.error) {
                    toast.error(result.error);
                    setStep("provider");
                } else if (result.data) {
                    setDiscoveredTeams(result.data.teams);
                    setSelectedTeams(new Set(result.data.teams.map((t) => t.provider_team_id)));
                    setStep("select");
                }
            } catch {
                toast.error("Failed to discover teams");
                setStep("provider");
            }
        });
    };

    const handleImport = () => {
        if (selectedTeams.size === 0) return;

        setStep("importing");
        const teamsToImport = discoveredTeams.filter((t) => selectedTeams.has(t.provider_team_id));

        startTransition(async () => {
            try {
                const result = await importTeams(teamsToImport, onConflict);
                if (result.error) {
                    toast.error(result.error);
                    setStep("select");
                } else if (result.data) {
                    setImportResult(result.data);
                    setStep("result");
                    router.refresh();
                }
            } catch {
                toast.error("Failed to import teams");
                setStep("select");
            }
        });
    };

    const toggleTeam = (id: string) => {
        const next = new Set(selectedTeams);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setSelectedTeams(next);
    };

    const toggleAll = () => {
        if (selectedTeams.size === discoveredTeams.length) {
            setSelectedTeams(new Set());
        } else {
            setSelectedTeams(new Set(discoveredTeams.map((t) => t.provider_team_id)));
        }
    };

    if (!isOpen) {
        return (
            <button
                type="button"
                onClick={handleOpen}
                className="cursor-pointer rounded-lg border border-(--border) bg-(--card) px-4 py-2 text-sm font-medium text-foreground hover:bg-(--card-80) transition-colors"
            >
                Import Teams
            </button>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl rounded-xl border border-(--border) bg-(--card) shadow-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between border-b border-(--border) p-6">
                    <h2 className="text-xl font-semibold text-foreground">Import Teams</h2>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="cursor-pointer rounded-md p-2 text-(--ink-muted) hover:bg-(--card-80) hover:text-foreground transition-colors"
                    >
                        ✕
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {step === "provider" && (
                        <div className="grid gap-4 sm:grid-cols-3">
                            {PROVIDERS.map((provider) => (
                                <button
                                    type="button"
                                    key={provider.id}
                                    onClick={() => handleDiscover(provider.id)}
                                    className="cursor-pointer flex flex-col items-start gap-2 rounded-lg border border-(--border) bg-(--card-80) p-4 text-left hover:border-(--accent) hover:bg-(--card) transition-all"
                                >
                                    <span className="font-medium text-foreground">
                                        {provider.name}
                                    </span>
                                    <span className="text-sm text-(--ink-muted)">
                                        {provider.description}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    {step === "discovering" && (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-(--accent) border-t-transparent" />
                            <p className="mt-4 text-(--ink-muted)">
                                Discovering teams from {selectedProvider}...
                            </p>
                        </div>
                    )}

                    {step === "select" && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={toggleAll}
                                        className="cursor-pointer text-sm text-(--accent) hover:underline"
                                    >
                                        {selectedTeams.size === discoveredTeams.length
                                            ? "Deselect All"
                                            : "Select All"}
                                    </button>
                                    <span className="text-sm text-(--ink-muted)">
                                        {selectedTeams.size} selected
                                    </span>
                                </div>

                                <div className="flex items-center gap-2 text-sm">
                                    <span className="text-(--ink-muted)">Conflict strategy:</span>
                                    <select
                                        value={onConflict}
                                        onChange={(e) =>
                                            setOnConflict(e.target.value as "skip" | "merge")
                                        }
                                        className="cursor-pointer rounded border border-(--border) bg-(--card-80) px-2 py-1 text-foreground focus:border-(--accent) focus:outline-none"
                                    >
                                        <option value="skip">Skip existing</option>
                                        <option value="merge">Merge with existing</option>
                                    </select>
                                </div>
                            </div>

                            <div className="max-h-[400px] overflow-y-auto rounded-lg border border-(--border)">
                                {discoveredTeams.length === 0 ? (
                                    <div className="p-8 text-center text-(--ink-muted)">
                                        No teams found.
                                    </div>
                                ) : (
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-(--card-80) text-(--ink-muted)">
                                            <tr>
                                                <th className="w-10 p-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={
                                                            selectedTeams.size ===
                                                                discoveredTeams.length &&
                                                            discoveredTeams.length > 0
                                                        }
                                                        onChange={toggleAll}
                                                        className="cursor-pointer rounded border-(--border) bg-(--card) text-(--accent) focus:ring-(--accent)"
                                                    />
                                                </th>
                                                <th className="p-3 font-medium">Team</th>
                                                <th className="p-3 font-medium">ID</th>
                                                <th className="p-3 font-medium">Associations</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-(--border)">
                                            {discoveredTeams.map((team) => (
                                                <tr
                                                    key={team.provider_team_id}
                                                    className="hover:bg-(--card-80)/50 cursor-pointer"
                                                    onClick={() =>
                                                        toggleTeam(team.provider_team_id)
                                                    }
                                                >
                                                    <td className="p-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedTeams.has(
                                                                team.provider_team_id,
                                                            )}
                                                            onChange={() =>
                                                                toggleTeam(team.provider_team_id)
                                                            }
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="cursor-pointer rounded border-(--border) bg-(--card) text-(--accent) focus:ring-(--accent)"
                                                        />
                                                    </td>
                                                    <td className="p-3">
                                                        <div className="font-medium text-foreground">
                                                            {team.name}
                                                        </div>
                                                        {team.description && (
                                                            <div className="text-xs text-(--ink-muted) truncate max-w-[200px]">
                                                                {team.description}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-(--ink-muted) font-mono text-xs">
                                                        {team.provider_team_id}
                                                    </td>
                                                    <td className="p-3 text-(--ink-muted)">
                                                        {Object.entries(team.associations).map(
                                                            ([key, val]) => (
                                                                <div key={key} className="text-xs">
                                                                    {key}:{" "}
                                                                    {Array.isArray(val)
                                                                        ? val.length
                                                                        : String(val)}
                                                                </div>
                                                            ),
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    )}

                    {step === "importing" && (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-(--accent) border-t-transparent" />
                            <p className="mt-4 text-(--ink-muted)">
                                Importing {selectedTeams.size} teams...
                            </p>
                        </div>
                    )}

                    {step === "result" && importResult && (
                        <div className="space-y-6 text-center">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                                ✓
                            </div>
                            <div>
                                <h3 className="text-lg font-medium text-foreground">
                                    Import Complete
                                </h3>
                                <p className="text-(--ink-muted)">
                                    Successfully processed {selectedTeams.size} teams.
                                </p>
                            </div>

                            <div className="grid grid-cols-3 gap-4 rounded-lg border border-(--border) bg-(--card-80) p-4">
                                <div>
                                    <div className="text-2xl font-bold text-foreground">
                                        {importResult.imported}
                                    </div>
                                    <div className="text-xs text-(--ink-muted)">Imported</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-foreground">
                                        {importResult.merged}
                                    </div>
                                    <div className="text-xs text-(--ink-muted)">Merged</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-foreground">
                                        {importResult.skipped}
                                    </div>
                                    <div className="text-xs text-(--ink-muted)">Skipped</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-(--border) p-6">
                    {step === "result" ? (
                        <button
                            type="button"
                            onClick={handleClose}
                            className="cursor-pointer rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                        >
                            Done
                        </button>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={handleClose}
                                disabled={isPending}
                                className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-(--ink-muted) hover:text-foreground disabled:opacity-50 transition-colors"
                            >
                                Cancel
                            </button>
                            {step === "select" && (
                                <button
                                    type="button"
                                    onClick={handleImport}
                                    disabled={selectedTeams.size === 0 || isPending}
                                    className="cursor-pointer rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                                >
                                    Import Selected ({selectedTeams.size})
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

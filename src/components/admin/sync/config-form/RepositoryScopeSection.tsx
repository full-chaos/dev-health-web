import type { ChangeEvent } from "react";
import { inputClass } from "@/components/shared/BaseForm";
import { RepoSelector } from "../RepoSelector";
import { FormSection } from "./FormSection";
import { DestructiveWarning } from "./DestructiveWarning";
import { PrerequisiteCallout } from "./PrerequisiteCallout";
import { getRepoSelectionBlockReason } from "./wizardSteps";

type RepositoryScopeSectionProps = {
    provider: string;
    owner: string;
    gitlabUrl: string;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    isEdit: boolean;
    syncAllRepos: boolean;
    onSyncAllReposChange: (checked: boolean) => void;
    canBrowseRepos: boolean;
    credentialId: string;
    repos: string[];
    onReposChange: (repos: string[]) => void;
    maxRepos?: number;
    destructiveWarnings: string[];
};

/** Owner/org, GitLab URL, and repo selection — only rendered for
 * repo-scoped providers (github/gitlab). */
export function RepositoryScopeSection({
    provider,
    owner,
    gitlabUrl,
    onChange,
    isEdit,
    syncAllRepos,
    onSyncAllReposChange,
    canBrowseRepos,
    credentialId,
    repos,
    onReposChange,
    maxRepos,
    destructiveWarnings,
}: RepositoryScopeSectionProps) {
    return (
        <FormSection
            title="Repository & source scope"
            description="Which repositories or organization this sync covers."
        >
            <div>
                <label
                    htmlFor="owner"
                    className="mb-1.5 block text-sm font-medium text-(--ink-muted)"
                >
                    Owner / Organization
                </label>
                <input
                    type="text"
                    id="owner"
                    name="owner"
                    value={owner}
                    onChange={onChange}
                    className={`${inputClass} text-sm`}
                    placeholder="e.g., myorg"
                />
            </div>
            {provider === "gitlab" && (
                <div>
                    <label
                        htmlFor="gitlab_url"
                        className="mb-1.5 block text-sm font-medium text-(--ink-muted)"
                    >
                        GitLab URL
                    </label>
                    <input
                        type="text"
                        id="gitlab_url"
                        name="gitlab_url"
                        value={gitlabUrl}
                        onChange={onChange}
                        className={`${inputClass} text-sm`}
                        placeholder="https://gitlab.com"
                    />
                </div>
            )}
            {!isEdit && (
                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="sync_all_repos"
                        name="sync_all_repos"
                        checked={syncAllRepos}
                        onChange={(e) => onSyncAllReposChange(e.target.checked)}
                        className="h-4 w-4 rounded border-(--card-stroke) bg-(--card-80) text-(--accent) focus:ring-(--accent)"
                    />
                    <label htmlFor="sync_all_repos" className="text-sm font-medium">
                        Sync all repositories this token can access
                    </label>
                </div>
            )}
            {syncAllRepos && (
                <p className="text-xs text-(--ink-muted)">
                    Every repository the selected credential can reach will be synced. Enter an
                    owner above to narrow this to a single organization (optional).
                </p>
            )}
            <DestructiveWarning items={destructiveWarnings} />
            {(() => {
                if (syncAllRepos || !canBrowseRepos) return null;
                const blockReason = getRepoSelectionBlockReason({
                    credentialId,
                    owner,
                    syncAllRepos,
                });
                if (!blockReason) {
                    return (
                        <div>
                            <span className="mb-2 block text-sm font-medium text-(--ink-muted)">
                                Select Repositories
                            </span>
                            <RepoSelector
                                credentialId={credentialId}
                                owner={owner}
                                selectedRepos={repos}
                                onSelectionChangeAction={onReposChange}
                                maxRepos={maxRepos}
                            />
                        </div>
                    );
                }
                return (
                    <PrerequisiteCallout
                        title="Repository selection unavailable"
                        description={blockReason}
                    />
                );
            })()}
        </FormSection>
    );
}

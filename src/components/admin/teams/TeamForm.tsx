import { type SyntheticEvent } from "react";
import Link from "next/link";
import { Team } from "./TeamTable";
import { BaseForm, inputClass, useBaseFormState } from "@/components/shared/BaseForm";
import { TokenInput } from "@/components/shared/TokenInput";
import { ReviewSummary, type ReviewSummaryRow } from "@/components/shared/ReviewSummary";
import { CTA_LABELS } from "@/lib/design/cta";

type TeamFormProps = {
    initialData?: Team;
    onSubmit: (data: Team) => void;
    isEditing?: boolean;
    isLoading?: boolean;
    /**
     * Count of identities currently mapped to this team (real backend data,
     * sourced from the identities list) — omitted on the create form, where
     * no such data exists yet, so the review preview degrades gracefully.
     */
    linkedIdentityCount?: number;
};

export function TeamForm({
    initialData,
    onSubmit,
    isEditing = false,
    isLoading = false,
    linkedIdentityCount,
}: TeamFormProps) {
    const { formData, setFormData, handleChange } = useBaseFormState<Team>(
        initialData || {
            team_id: "",
            name: "",
            description: "",
            repo_patterns: [],
            project_keys: [],
        },
    );

    const handleRepoPatternsChange = (next: string[]) => {
        setFormData((prev) => ({ ...prev, repo_patterns: next }));
    };

    const handleProjectKeysChange = (next: string[]) => {
        setFormData((prev) => ({ ...prev, project_keys: next }));
    };

    const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
        event.preventDefault();
        onSubmit({ ...formData });
    };

    const reviewRows: ReviewSummaryRow[] = [
        { label: "Team ID", value: formData.team_id || "—" },
        {
            label: "Repository patterns",
            value:
                formData.repo_patterns.length > 0
                    ? formData.repo_patterns.join(", ")
                    : "None added",
        },
        {
            label: "Project keys",
            value:
                formData.project_keys.length > 0 ? formData.project_keys.join(", ") : "None added",
        },
    ];
    if (linkedIdentityCount !== undefined) {
        reviewRows.push({
            label: "Linked identities",
            value: `${linkedIdentityCount} ${linkedIdentityCount === 1 ? "identity" : "identities"} currently mapped`,
        });
    }

    return (
        <BaseForm
            onSubmitAction={handleSubmit}
            isLoading={isLoading}
            submitLabel={isLoading ? "Saving…" : isEditing ? "Update Team" : "Create Team"}
            className="max-w-2xl space-y-6"
            contentClassName="space-y-4 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6"
            actionsClassName="flex items-center gap-4"
            actionsStart={
                <Link
                    href="/org/admin/teams"
                    className="rounded-lg px-4 py-2 text-sm font-medium text-(--ink-muted) hover:text-foreground"
                >
                    {CTA_LABELS.cancel}
                </Link>
            }
        >
            <div>
                <label htmlFor="team_id" className="mb-1.5 block text-sm font-medium">
                    Team ID
                </label>
                <input
                    type="text"
                    id="team_id"
                    name="team_id"
                    value={formData.team_id}
                    onChange={handleChange}
                    disabled={isEditing}
                    required
                    className={`${inputClass} text-sm disabled:opacity-50`}
                    placeholder="e.g., platform-eng"
                />
                <p className="mt-1 text-xs text-(--ink-muted)">
                    Unique identifier for the team. Cannot be changed after creation.
                </p>
            </div>

            <div>
                <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
                    Display Name
                </label>
                <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className={`${inputClass} text-sm`}
                    placeholder="e.g., Platform Engineering"
                />
            </div>

            <div>
                <label htmlFor="description" className="mb-1.5 block text-sm font-medium">
                    Description
                </label>
                <textarea
                    id="description"
                    name="description"
                    value={formData.description ?? ""}
                    onChange={handleChange}
                    rows={3}
                    className={`${inputClass} text-sm`}
                    placeholder="Brief description of the team's responsibilities"
                />
            </div>

            <div>
                <span className="mb-1.5 block text-sm font-medium">Repository Patterns</span>
                <TokenInput
                    value={formData.repo_patterns}
                    onChangeAction={handleRepoPatternsChange}
                    ariaLabel="Repository Patterns"
                    placeholder="e.g., github/org/repo-*"
                />
                <p className="mt-1 text-xs text-(--ink-muted)">
                    Glob patterns matching repositories owned by this team. Press Enter or comma to
                    add each pattern.
                </p>
            </div>

            <div>
                <span className="mb-1.5 block text-sm font-medium">Project Keys</span>
                <TokenInput
                    value={formData.project_keys}
                    onChangeAction={handleProjectKeysChange}
                    ariaLabel="Project Keys"
                    placeholder="e.g., PROJ"
                />
                <p className="mt-1 text-xs text-(--ink-muted)">
                    Project keys (e.g. Jira) owned by this team. Press Enter or comma to add each
                    key.
                </p>
            </div>

            <div>
                <span className="mb-1.5 block text-sm font-medium">Review before saving</span>
                <ReviewSummary rows={reviewRows} />
            </div>
        </BaseForm>
    );
}

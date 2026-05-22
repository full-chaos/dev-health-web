import { useState, type SyntheticEvent } from "react";
import Link from "next/link";
import { Team } from "./TeamTable";
import { BaseForm, inputClass, useBaseFormState } from "@/components/shared/BaseForm";

type TeamFormProps = {
  initialData?: Team;
  onSubmit: (data: Team) => void;
  isEditing?: boolean;
  isLoading?: boolean;
};

export function TeamForm({
  initialData,
  onSubmit,
  isEditing = false,
  isLoading = false,
}: TeamFormProps) {
  const { formData, handleChange } = useBaseFormState<Team>(
    initialData || {
      team_id: "",
      name: "",
      description: "",
      repo_patterns: [],
      project_keys: [],
    },
  );

  const [repoPatternsInput, setRepoPatternsInput] = useState(
    initialData?.repo_patterns.join(", ") || "",
  );
  const [projectKeysInput, setProjectKeysInput] = useState(
    initialData?.project_keys.join(", ") || "",
  );

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const repo_patterns = repoPatternsInput
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const project_keys = projectKeysInput
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    onSubmit({
      ...formData,
      repo_patterns,
      project_keys,
    });
  };

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
          href="/admin/teams"
          className="rounded-lg px-4 py-2 text-sm font-medium text-(--ink-muted) hover:text-foreground"
        >
          Cancel
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
        <label htmlFor="repo_patterns" className="mb-1.5 block text-sm font-medium">
          Repository Patterns
        </label>
        <input
          type="text"
          id="repo_patterns"
          value={repoPatternsInput}
          onChange={(event) => setRepoPatternsInput(event.target.value)}
          className={`${inputClass} text-sm`}
          placeholder="e.g., github/org/repo-*, gitlab/group/*"
        />
        <p className="mt-1 text-xs text-(--ink-muted)">
          Comma-separated list of glob patterns to match repositories owned by this team.
        </p>
      </div>

      <div>
        <label htmlFor="project_keys" className="mb-1.5 block text-sm font-medium">
          Project Keys
        </label>
        <input
          type="text"
          id="project_keys"
          value={projectKeysInput}
          onChange={(event) => setProjectKeysInput(event.target.value)}
          className={`${inputClass} text-sm`}
          placeholder="e.g., PROJ, PLAT"
        />
        <p className="mt-1 text-xs text-(--ink-muted)">
          Comma-separated list of project keys (e.g. Jira) owned by this team.
        </p>
      </div>
    </BaseForm>
  );
}

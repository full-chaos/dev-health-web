import React, { useState } from "react";
import Link from "next/link";
import { Team } from "./TeamTable";

type TeamFormProps = {
  initialData?: Team;
  onSubmit: (data: Team) => void;
  isEditing?: boolean;
};

export function TeamForm({ initialData, onSubmit, isEditing = false }: TeamFormProps) {
  const [formData, setFormData] = useState<Team>(
    initialData || {
      team_id: "",
      name: "",
      description: "",
      repo_patterns: [],
      project_keys: [],
    }
  );

  const [repoPatternsInput, setRepoPatternsInput] = useState(
    initialData?.repo_patterns.join(", ") || ""
  );
  const [projectKeysInput, setProjectKeysInput] = useState(
    initialData?.project_keys.join(", ") || ""
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const repo_patterns = repoPatternsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const project_keys = projectKeysInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    onSubmit({
      ...formData,
      repo_patterns,
      project_keys,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div className="space-y-4 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6">
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
            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent) disabled:opacity-50"
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
            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
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
            value={formData.description}
            onChange={handleChange}
            rows={3}
            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
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
            onChange={(e) => setRepoPatternsInput(e.target.value)}
            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
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
            onChange={(e) => setProjectKeysInput(e.target.value)}
            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
            placeholder="e.g., PROJ, PLAT"
          />
          <p className="mt-1 text-xs text-(--ink-muted)">
            Comma-separated list of project keys (e.g. Jira) owned by this team.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Link
          href="/admin/teams"
          className="rounded-lg px-4 py-2 text-sm font-medium text-(--ink-muted) hover:text-foreground"
        >
          Cancel
        </Link>
        <button
          type="submit"
          className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90"
        >
          {isEditing ? "Update Team" : "Create Team"}
        </button>
      </div>
    </form>
  );
}

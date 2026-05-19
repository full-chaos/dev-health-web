"use client";

import { useRouter } from "next/navigation";
import { useDimensionValues } from "@/lib/graphql/hooks/useCatalog";
import { useOrgId } from "@/lib/graphql/provider";
import { encodeAIFilterParam, type AIFilter } from "@/lib/filters/ai";

type AIFilterBarProps = {
  filter: AIFilter;
};

export function AIFilterBar({ filter }: AIFilterBarProps) {
  const router = useRouter();
  const orgId = useOrgId() ?? "";
  const { values: teams } = useDimensionValues({ orgId, dimension: "TEAM", pause: !orgId });
  const { values: repos } = useDimensionValues({ orgId, dimension: "REPO", pause: !orgId });
  const { values: workTypes } = useDimensionValues({ orgId, dimension: "WORK_TYPE", pause: !orgId });

  const update = (patch: Partial<AIFilter>) => {
    const next = { ...filter, ...patch };
    const params = new URLSearchParams();
    params.set("f", encodeAIFilterParam(next));
    router.replace(`/ai/impact?${params.toString()}`);
  };

  return (
    <section className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-4" data-testid="ai-filter-bar">
      <div className="grid gap-3 md:grid-cols-5">
        <label className="text-xs font-medium uppercase tracking-[0.12em] text-(--ink-muted)">
          Start
          <input className="mt-1 w-full rounded-xl border border-(--card-stroke) bg-background px-3 py-2 text-sm text-foreground" type="date" value={filter.startDate} onChange={(event) => update({ startDate: event.target.value })} />
        </label>
        <label className="text-xs font-medium uppercase tracking-[0.12em] text-(--ink-muted)">
          End
          <input className="mt-1 w-full rounded-xl border border-(--card-stroke) bg-background px-3 py-2 text-sm text-foreground" type="date" value={filter.endDate} onChange={(event) => update({ endDate: event.target.value })} />
        </label>
        <Select label="Team" value={filter.teamId ?? ""} options={teams.map((item) => item.value)} onChange={(teamId) => update({ teamId: teamId || undefined })} />
        <Select label="Repo" value={filter.repoId ?? ""} options={repos.map((item) => item.value)} onChange={(repoId) => update({ repoId: repoId || undefined })} />
        <Select label="Work type" value={filter.workType ?? ""} options={workTypes.map((item) => item.value)} onChange={(workType) => update({ workType: workType || undefined })} />
      </div>
    </section>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="text-xs font-medium uppercase tracking-[0.12em] text-(--ink-muted)">
      {label}
      <select className="mt-1 w-full rounded-xl border border-(--card-stroke) bg-background px-3 py-2 text-sm text-foreground" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

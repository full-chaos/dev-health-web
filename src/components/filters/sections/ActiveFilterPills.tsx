import { FilterPill } from "../FilterPill";

type ActiveFilterPillsProps = {
  artifacts: string[];
  blocked: boolean;
  developers: string[];
  flowStage: string[];
  issueType: string[];
  onClearArtifact: (value: string) => void;
  onClearBlocked: () => void;
  onClearDeveloper: (value: string) => void;
  onClearFlowStage: (value: string) => void;
  onClearIssueType: (value: string) => void;
  onClearRepo: (value: string) => void;
  onClearRole: (value: string) => void;
  onClearWorkCategory: (value: string) => void;
  repos: string[];
  roles: string[];
  workCategory: string[];
};

export function ActiveFilterPills({
  artifacts,
  blocked,
  developers,
  flowStage,
  issueType,
  onClearArtifact,
  onClearBlocked,
  onClearDeveloper,
  onClearFlowStage,
  onClearIssueType,
  onClearRepo,
  onClearRole,
  onClearWorkCategory,
  repos,
  roles,
  workCategory,
}: ActiveFilterPillsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {repos.map((repo) => (
        <FilterPill
          key={`repo-${repo}`}
          label="Repo"
          value={repo}
          onClear={() => onClearRepo(repo)}
        />
      ))}
      {developers.map((dev) => (
        <FilterPill
          key={`dev-${dev}`}
          label="Dev"
          value={dev}
          onClear={() => onClearDeveloper(dev)}
        />
      ))}
      {roles.map((role) => (
        <FilterPill
          key={`role-${role}`}
          label="Role"
          value={role}
          onClear={() => onClearRole(role)}
        />
      ))}
      {workCategory.map((cat) => (
        <FilterPill
          key={`cat-${cat}`}
          label="Work"
          value={cat}
          onClear={() => onClearWorkCategory(cat)}
        />
      ))}
      {issueType.map((type) => (
        <FilterPill
          key={`type-${type}`}
          label="Type"
          value={type}
          onClear={() => onClearIssueType(type)}
        />
      ))}
      {flowStage.map((stage) => (
        <FilterPill
          key={`stage-${stage}`}
          label="Stage"
          value={stage}
          onClear={() => onClearFlowStage(stage)}
        />
      ))}
      {artifacts.map((art) => (
        <FilterPill
          key={`art-${art}`}
          label="Artifact"
          value={art}
          onClear={() => onClearArtifact(art)}
        />
      ))}
      {blocked && <FilterPill label="Status" value="Blocked" onClear={onClearBlocked} />}
    </div>
  );
}

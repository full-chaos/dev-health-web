import { FilterPill } from "../FilterPill";
import type { UnreadFilter } from "../filterBarConfig";

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
    /** Filters the view's queries do not read: no pill for a value left in an old URL. */
    unread?: readonly UnreadFilter[];
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
    unread = [],
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
            {(unread.includes("developers") ? [] : developers).map((dev) => (
                <FilterPill
                    key={`dev-${dev}`}
                    label="Dev"
                    value={dev}
                    onClear={() => onClearDeveloper(dev)}
                />
            ))}
            {(unread.includes("roles") ? [] : roles).map((role) => (
                <FilterPill
                    key={`role-${role}`}
                    label="Role"
                    value={role}
                    onClear={() => onClearRole(role)}
                />
            ))}
            {(unread.includes("workCategory") ? [] : workCategory).map((cat) => (
                <FilterPill
                    key={`cat-${cat}`}
                    label="Work"
                    value={cat}
                    onClear={() => onClearWorkCategory(cat)}
                />
            ))}
            {(unread.includes("issueType") ? [] : issueType).map((type) => (
                <FilterPill
                    key={`type-${type}`}
                    label="Type"
                    value={type}
                    onClear={() => onClearIssueType(type)}
                />
            ))}
            {(unread.includes("flowStage") ? [] : flowStage).map((stage) => (
                <FilterPill
                    key={`stage-${stage}`}
                    label="Stage"
                    value={stage}
                    onClear={() => onClearFlowStage(stage)}
                />
            ))}
            {(unread.includes("artifacts") ? [] : artifacts).map((art) => (
                <FilterPill
                    key={`art-${art}`}
                    label="Artifact"
                    value={art}
                    onClear={() => onClearArtifact(art)}
                />
            ))}
            {blocked && !unread.includes("blocked") && (
                <FilterPill label="Status" value="Blocked" onClear={onClearBlocked} />
            )}
        </div>
    );
}

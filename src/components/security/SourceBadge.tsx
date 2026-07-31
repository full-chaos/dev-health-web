import type { SecuritySource } from "@/lib/filters/security";

const SOURCE_LABELS: Record<SecuritySource, string> = {
    dependabot: "Dependabot",
    code_scanning: "Code Scanning",
    advisory: "Advisory",
    gitlab_vulnerability: "GitLab Vuln",
    gitlab_dependency: "GitLab Deps",
};

interface SourceBadgeProps {
    source: SecuritySource;
}

export function SourceBadge({ source }: SourceBadgeProps) {
    const label = SOURCE_LABELS[source] ?? source;

    return (
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-label-caps font-semibold uppercase tracking-wider text-slate-700">
            {label}
        </span>
    );
}

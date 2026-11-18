import { type GrantedRepositories, repositoryCountLabel } from "@/lib/acr/grantedRepositories";

type GrantedRepositoriesSectionProps = {
    readonly granted: GrantedRepositories;
    /** "device" on the device approval page, "application" on the consent page. */
    readonly subject: "application" | "device";
    readonly titleId?: string;
};

// The repositories the credential will hold (CHAOS-14134): the organization text only for `*`; a named reader sees
// the count and the keys.
export function GrantedRepositoriesSection({
    granted,
    subject,
    titleId,
}: GrantedRepositoriesSectionProps) {
    const named = granted.kind === "repositories" ? granted.repositories : undefined;
    return (
        <section
            aria-labelledby={titleId}
            className="rounded-(--radius-md) border border-(--card-stroke) bg-background px-4 py-4"
        >
            <h2 id={titleId} className="text-h3 font-medium">
                {named === undefined
                    ? "All organization repositories"
                    : repositoryCountLabel(named.length)}
            </h2>
            {named === undefined ? (
                <p className="mt-1 text-sm text-(--ink-muted)">
                    This {subject} can read context from all current and future repositories in your
                    organization. Access never extends to another organization.
                </p>
            ) : (
                <>
                    <p className="mt-1 text-sm text-(--ink-muted)">
                        This {subject} can read context from{" "}
                        {named.length === 1
                            ? "this repository"
                            : `these ${named.length} repositories`}{" "}
                        in your organization only. It gets no access to other or future
                        repositories.
                    </p>
                    <details className="mt-3 text-sm">
                        <summary className="cursor-pointer font-medium">Show repositories</summary>
                        <ul aria-label="Granted repositories" className="mt-2 space-y-1">
                            {named.map((key) => (
                                <li key={key}>
                                    <code className="font-mono text-(--ink-muted)">{key}</code>
                                </li>
                            ))}
                        </ul>
                    </details>
                </>
            )}
        </section>
    );
}

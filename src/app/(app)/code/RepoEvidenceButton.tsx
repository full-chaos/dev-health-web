"use client";

import { ArrowRight } from "lucide-react";

import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { EvidenceFact, EvidenceFactList } from "@/components/evidence/EvidenceFacts";
import Link from "next/link";

import { Button, buttonClassName } from "@/components/shared/Button";
import { CTA_LABELS } from "@/lib/design/cta";

/** What the drawer shows for one repository row: the served values only. */
export type RepoEvidenceFacts = {
    repoName: string;
    churn?: string;
    maintainers: { name: string; share: string }[];
    /** The served evidence link of the repository's churn contributor, if any. */
    evidenceHref?: string;
    busFactor: string;
    samples: string;
};

/** The row's "Evidence" action: opens the one shared drawer with the repository's served values. */
export function RepoEvidenceButton({ repo }: { repo: RepoEvidenceFacts }) {
    const evidence = useEvidenceDrawer();
    return (
        <Button
            variant="ghost"
            size="sm"
            icon={<ArrowRight />}
            data-testid="repo-evidence-button"
            aria-label={`Evidence for ${repo.repoName}`}
            onClick={() =>
                evidence.open({
                    title: repo.repoName,
                    footer: repo.evidenceHref ? (
                        <Link
                            href={repo.evidenceHref}
                            data-testid="repo-evidence-link"
                            onClick={evidence.close}
                            className={buttonClassName("secondary", "md", "w-full")}
                        >
                            <ArrowRight aria-hidden="true" className="h-4 w-4" />
                            {CTA_LABELS.openEvidence}
                        </Link>
                    ) : undefined,
                    content: (
                        <EvidenceFactList aria-label="Repository" testId="repo-evidence-facts">
                            <EvidenceFact label="Repository" value={repo.repoName} />
                            <EvidenceFact label="Bus factor" value={repo.busFactor} />
                            <EvidenceFact label="Churn" value={repo.churn} />
                            <EvidenceFact label="File-change samples" value={repo.samples} />
                            {repo.maintainers.length ? (
                                repo.maintainers.map((m, index) => (
                                    <EvidenceFact
                                        key={`${m.name}-${index}`}
                                        label="Maintainer"
                                        value={`${m.name} · ${m.share}`}
                                        stacked
                                    />
                                ))
                            ) : (
                                <EvidenceFact label="Maintainer" />
                            )}
                        </EvidenceFactList>
                    ),
                })
            }
        >
            {CTA_LABELS.evidence}
        </Button>
    );
}

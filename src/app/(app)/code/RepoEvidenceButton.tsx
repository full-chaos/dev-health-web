"use client";

import { ArrowRight } from "lucide-react";

import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { EvidenceFact, EvidenceFactList } from "@/components/evidence/EvidenceFacts";
import { Button } from "@/components/shared/Button";
import { CTA_LABELS } from "@/lib/design/cta";

/** What the drawer shows for one repository row: the served values only. */
export type RepoEvidenceFacts = {
    repoName: string;
    hotspotScore?: string;
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
                    content: (
                        <EvidenceFactList aria-label="Repository" testId="repo-evidence-facts">
                            <EvidenceFact label="Repository" value={repo.repoName} />
                            <EvidenceFact label="Hotspot score" value={repo.hotspotScore} />
                            <EvidenceFact label="Bus factor" value={repo.busFactor} />
                            <EvidenceFact label="File-change samples" value={repo.samples} />
                        </EvidenceFactList>
                    ),
                })
            }
        >
            {CTA_LABELS.evidence}
        </Button>
    );
}

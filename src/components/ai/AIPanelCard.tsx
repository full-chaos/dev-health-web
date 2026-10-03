import Link from "next/link";
import type { ReactNode } from "react";

import { Section } from "@/components/ui/Section";
import { CTA_LABELS } from "@/lib/design/cta";

type AIPanelCardProps = {
    title: string;
    description: string;
    evidenceHref?: string;
    children: ReactNode;
};

export function AIPanelCard({ title, description, evidenceHref, children }: AIPanelCardProps) {
    return (
        <Section
            title={title}
            description={description}
            data-testid={`ai-panel-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            action={
                evidenceHref ? (
                    <Link
                        className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
                        href={evidenceHref}
                    >
                        {CTA_LABELS.openEvidence}
                    </Link>
                ) : undefined
            }
        >
            {children}
        </Section>
    );
}

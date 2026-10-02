import Link from "next/link";
import type { ReactNode } from "react";
import { CTA_LABELS } from "@/lib/design/cta";

type AIPanelCardProps = {
    title: string;
    description: string;
    evidenceHref?: string;
    children: ReactNode;
};

export function AIPanelCard({ title, description, evidenceHref, children }: AIPanelCardProps) {
    return (
        <section
            className="rounded-(--radius-md) border border-(--card-stroke) bg-card p-5"
            data-testid={`ai-panel-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
        >
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-h3 font-semibold">{title}</h2>
                    <p className="mt-1 text-xs text-(--ink-muted)">{description}</p>
                </div>
                {evidenceHref && (
                    <Link
                        className="shrink-0 text-xs font-medium text-foreground underline-offset-4 hover:underline"
                        href={evidenceHref}
                    >
                        {CTA_LABELS.openEvidence}
                    </Link>
                )}
            </div>
            <div className="mt-4">{children}</div>
        </section>
    );
}

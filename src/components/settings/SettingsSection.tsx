import React from "react";

import { Section } from "@/components/ui/Section";

type SettingsSectionProps = {
    title: string;
    description: string;
    children: React.ReactNode;
    danger?: boolean;
};

/**
 * A titled settings card: the shared Section (title, one-line description, body). `danger` adds the
 * red left edge of the design's Danger Zone; the card stays neutral, the title and text keep their
 * normal colours, and the red is on the edge and on the destructive button only.
 */
export function SettingsSection({ title, description, children, danger }: SettingsSectionProps) {
    return (
        <Section
            title={title}
            description={description}
            data-danger={danger ? "true" : undefined}
            className={`mb-8 ${danger ? "border-l-[3px] border-l-(--negative)" : ""}`.trim()}
        >
            {children}
        </Section>
    );
}

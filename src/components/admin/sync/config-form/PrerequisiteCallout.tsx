type PrerequisiteCalloutProps = {
    title: string;
    description: string;
};

/** Inline info-circle glyph (design system forbids emoji-as-icon). */
function InfoIcon() {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="mt-0.5 h-4 w-4 shrink-0"
        >
            <circle cx="10" cy="10" r="7.25" />
            <path strokeLinecap="round" d="M10 9v4.5" />
            <path strokeLinecap="round" d="M10 6.5h.01" />
        </svg>
    );
}

/**
 * Prominent, actionable gating callout (CHAOS-2838): used whenever a
 * prerequisite — provider, credential, owner/source — isn't satisfied yet,
 * so the blocker reads as a first-class piece of content rather than tiny
 * muted helper text easy to miss.
 */
export function PrerequisiteCallout({ title, description }: PrerequisiteCalloutProps) {
    return (
        <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-(--info)/30 bg-(--info)/10 p-4"
        >
            <InfoIcon />
            <div>
                <p className="text-sm font-semibold text-(--foreground)">{title}</p>
                <p className="mt-1 text-sm text-(--ink-muted)">{description}</p>
            </div>
        </div>
    );
}

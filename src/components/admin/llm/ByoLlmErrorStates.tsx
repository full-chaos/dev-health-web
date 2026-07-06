import { AIPanelCard } from "@/components/ai/AIPanelCard";

/**
 * Display-only reference for how BYO-LLM provider failures surface to org
 * admins (CHAOS-2563). Purely presentational — no data fetch, no recompute,
 * no mutation. Wording mirrors the real exception hierarchy in
 * `ops/.../llm/errors.py` (`LLMAuthError`, `LLMRateLimitError`,
 * `LLMServerError`) plus the two non-provider states an admin can hit before
 * a provider call is even attempted (the tier gate) or when a call succeeds
 * (the streamed success path).
 */

type ErrorStateTone = "success" | "warning" | "danger" | "locked";

type ErrorStateEntry = {
    status: string;
    title: string;
    /** Exception class from `ops/.../llm/errors.py`, when one applies. */
    taxonomy?: string;
    description: string;
    tone: ErrorStateTone;
};

const TONE_CLASSES: Record<ErrorStateTone, string> = {
    success: "border-(--positive)/30 bg-(--positive)/10 text-(--positive)",
    warning: "border-(--accent-3)/40 bg-(--accent-3)/10 text-(--accent-3)",
    danger: "border-(--negative)/30 bg-(--negative)/10 text-(--negative)",
    locked: "border-(--card-stroke) bg-(--card-70) text-(--ink-muted)",
};

const ERROR_STATES: ErrorStateEntry[] = [
    {
        status: "200",
        title: "Streamed response",
        description:
            "The provider call succeeds and the response streams back to the caller normally.",
        tone: "success",
    },
    {
        status: "422",
        title: "Invalid key",
        taxonomy: "LLMAuthError",
        description:
            "The provider rejects the stored credentials (bad or missing API key). Resolve by updating the API key in AI Setup.",
        tone: "danger",
    },
    {
        status: "429",
        title: "Rate limited",
        taxonomy: "LLMRateLimitError",
        description:
            "The provider's rate limit or quota is exceeded. The provider's Retry-After header is honored (capped) before an automatic retry.",
        tone: "warning",
    },
    {
        status: "503",
        title: "Provider error",
        taxonomy: "LLMServerError",
        description:
            "A transient 5xx from the provider. Retried with exponential backoff before surfacing as a failure.",
        tone: "warning",
    },
    {
        status: "402",
        title: "Not licensed",
        taxonomy: "Tier gate",
        description:
            "The organization's plan does not include BYO-LLM. Enforced before any provider call is attempted — no request ever leaves the platform.",
        tone: "locked",
    },
];

export function ByoLlmErrorStates() {
    return (
        <AIPanelCard
            title="Explain Error States"
            description="How BYO-LLM provider failures surface to org admins. Reference only — nothing here is live."
        >
            <dl className="grid gap-3 sm:grid-cols-2">
                {ERROR_STATES.map((entry) => (
                    <div
                        key={entry.status}
                        data-testid={`byo-llm-error-state-${entry.status}`}
                        className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4"
                    >
                        <div className="flex flex-wrap items-center gap-2">
                            <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${TONE_CLASSES[entry.tone]}`}
                            >
                                {entry.status}
                            </span>
                            <dt className="text-sm font-semibold text-foreground">{entry.title}</dt>
                            {entry.taxonomy && (
                                <code className="rounded bg-(--card-80) px-1.5 py-0.5 text-xs text-(--ink-muted)">
                                    {entry.taxonomy}
                                </code>
                            )}
                        </div>
                        <dd className="mt-2 text-xs text-(--ink-muted)">{entry.description}</dd>
                    </div>
                ))}
            </dl>
        </AIPanelCard>
    );
}

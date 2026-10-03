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

type ErrorStateEntry = {
    status: string;
    title: string;
    /** Exception class from `ops/.../llm/errors.py`, when one applies. */
    taxonomy?: string;
    description: string;
};

const ERROR_STATES: ErrorStateEntry[] = [
    {
        status: "200",
        title: "Streamed response",
        description:
            "The provider call succeeds and the response streams back to the caller normally.",
    },
    {
        status: "422",
        title: "Invalid key",
        taxonomy: "LLMAuthError",
        description:
            "The provider rejects the stored credentials (bad or missing API key). Resolve by updating the API key in AI Setup.",
    },
    {
        status: "429",
        title: "Rate limited",
        taxonomy: "LLMRateLimitError",
        description:
            "The provider's rate limit or quota is exceeded. The provider's Retry-After header is honored (capped) before an automatic retry.",
    },
    {
        status: "503",
        title: "Provider error",
        taxonomy: "LLMServerError",
        description:
            "A transient 5xx from the provider. Retried with exponential backoff before surfacing as a failure.",
    },
    {
        status: "402",
        title: "Not licensed",
        taxonomy: "Tier gate",
        description:
            "The organization's plan does not include BYO-LLM. Enforced before any provider call is attempted — no request ever leaves the platform.",
    },
];

export function ByoLlmErrorStates() {
    return (
        <AIPanelCard
            title="Explain Error States"
            description="How BYO-LLM provider failures surface to org admins. Reference only — nothing here is live."
        >
            {/* A reference table (design): code, state, exception class, what happens. */}
            <div className="overflow-x-auto rounded-(--radius-sm) border border-(--card-stroke)">
                <table className="w-full text-left text-sm" data-testid="byo-llm-error-states">
                    <thead className="bg-background text-label-caps uppercase text-(--ink-muted)">
                        <tr>
                            <th className="px-3 py-2.75 font-medium">Code</th>
                            <th className="px-3 py-2.75 font-medium">State</th>
                            <th className="px-3 py-2.75 font-medium">Class</th>
                            <th className="px-3 py-2.75 font-medium">What happens</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-(--card-stroke)">
                        {ERROR_STATES.map((entry) => (
                            <tr
                                key={entry.status}
                                data-testid={`byo-llm-error-state-${entry.status}`}
                            >
                                <td className="px-3 py-3 align-top font-mono text-xs">
                                    {entry.status}
                                </td>
                                <td className="px-3 py-3 align-top font-semibold text-foreground">
                                    {entry.title}
                                </td>
                                <td className="px-3 py-3 align-top font-mono text-xs text-(--ink-muted)">
                                    {entry.taxonomy ?? "—"}
                                </td>
                                <td className="px-3 py-3 align-top text-(--ink-muted)">
                                    {entry.description}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </AIPanelCard>
    );
}

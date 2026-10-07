import { EntityLabel } from "@/components/labels/EntityLabel";
import type { CockpitSignal } from "@/lib/types";
import { Inset } from "@/components/ui/Inset";

type IntroSignal = Pick<
    CockpitSignal,
    "why_it_matters" | "recommended_action" | "affected_scope" | "scope_entity" | "attribution"
>;

/**
 * What the API served about a Home signal beside its numbers: the affected scope, "why it
 * matters" and the recommended action. It is the first block of the shared evidence drawer for
 * that signal (`EvidenceRequestSubject.intro`). The Home body shows only the approved prototype
 * elements, so these served texts are read in the drawer of their signal.
 *
 * Wording as served. `EntityLabel` only keeps a raw identifier out of the text and prefers the
 * server-resolved scope name.
 */
export function SignalEvidenceIntro({ signal }: { signal: IntroSignal }) {
    const scopeId = signal.scope_entity?.id ?? signal.affected_scope;
    if (!scopeId && !signal.why_it_matters && !signal.recommended_action) return null;

    return (
        <Inset as="section" flush data-testid="signal-evidence-intro" className="space-y-3">
            {scopeId ? (
                <div>
                    <h4 className="text-xs font-semibold text-foreground">Scope</h4>
                    <p className="mt-1 text-xs leading-5 text-(--ink-muted)">
                        <EntityLabel
                            id={scopeId}
                            displayName={signal.scope_entity?.display_name ?? null}
                            data-testid="signal-scope"
                        />
                    </p>
                </div>
            ) : null}
            {signal.why_it_matters ? (
                <div>
                    <h4 className="text-xs font-semibold text-foreground">Why it matters</h4>
                    <p
                        data-testid="signal-why"
                        className="mt-1 text-xs leading-5 text-(--ink-muted)"
                    >
                        <EntityLabel variant="text" id={signal.why_it_matters} />
                    </p>
                </div>
            ) : null}
            {signal.recommended_action ? (
                <div>
                    <h4 className="text-xs font-semibold text-foreground">Recommended action</h4>
                    <p
                        data-testid="signal-recommended-action"
                        className="mt-1 text-xs leading-5 text-(--ink-muted)"
                    >
                        <EntityLabel variant="text" id={signal.recommended_action} />
                    </p>
                </div>
            ) : null}
            <div data-testid="signal-attribution">
                <h4 className="text-xs font-semibold text-foreground">Attribution provenance</h4>
                {signal.attribution ? (
                    <div
                        data-testid="signal-attribution-reported"
                        className="mt-1 space-y-2 text-xs leading-5 text-(--ink-muted)"
                    >
                        <p data-testid="signal-attribution-items">
                            Attributed items: {signal.attribution.items}
                        </p>
                        <div>
                            <h5 className="font-semibold text-foreground">Sources</h5>
                            <ul className="mt-1 space-y-1" data-testid="signal-attribution-sources">
                                {signal.attribution.sources.map((source, index) => (
                                    <li key={`${source.source}-${index}`}>
                                        <span data-testid="signal-attribution-source">
                                            {source.source}
                                        </span>
                                        {": "}
                                        <span data-testid="signal-attribution-source-values">
                                            {source.items} items · share {source.share}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <h5 className="font-semibold text-foreground">Confidence</h5>
                            <ul
                                className="mt-1 space-y-1"
                                data-testid="signal-attribution-confidence"
                            >
                                {signal.attribution.confidence.map((confidence, index) => (
                                    <li key={`${confidence.confidence}-${index}`}>
                                        <span data-testid="signal-attribution-confidence-level">
                                            {confidence.confidence}
                                        </span>
                                        {": "}
                                        <span data-testid="signal-attribution-confidence-values">
                                            {confidence.items} items · share {confidence.share}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                ) : (
                    <p
                        data-testid="signal-attribution-not-reported"
                        className="mt-1 text-xs leading-5 text-(--ink-muted)"
                    >
                        Not reported
                    </p>
                )}
            </div>
        </Inset>
    );
}

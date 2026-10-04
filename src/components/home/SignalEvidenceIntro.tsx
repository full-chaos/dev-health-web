import { EntityLabel } from "@/components/labels/EntityLabel";
import type { CockpitSignal } from "@/lib/types";
import { Inset } from "@/components/ui/Inset";

type IntroSignal = Pick<
    CockpitSignal,
    "why_it_matters" | "recommended_action" | "affected_scope" | "scope_entity"
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
        </Inset>
    );
}

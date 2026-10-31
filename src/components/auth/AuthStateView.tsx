import Link from "next/link";
import { notFound } from "next/navigation";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { UpgradeGate } from "@/components/billing/UpgradeGate";
import { CTA_LABELS } from "@/lib/design/cta";
import { reasonToState, type ReasonStateContext } from "@/lib/auth/reasonStates";

type AuthStateViewProps = ReasonStateContext & {
    /** The reason code from the server. Only the code picks the state. */
    reason: unknown;
    /** Server text. Accepted so callers can pass the whole error; never rendered. */
    message?: string;
    /** The gated feature and its plan; without it the entitlement state shows the fixed text. */
    upgrade?: { feature: string; requiredTier: string };
};

/** Thin view over reasonToState. Shows fixed client text only; never server text. */
export function AuthStateView({ reason, hidden, entitlement, upgrade }: AuthStateViewProps) {
    const { state, message } = reasonToState(reason, { hidden, entitlement });
    switch (state) {
        case "notfound":
            return notFound();
        case "unavailable":
            return <ServiceUnavailable landmark={false} />;
        case "entitlement":
            if (upgrade) {
                return (
                    <UpgradeGate
                        feature={upgrade.feature}
                        requiredTier={upgrade.requiredTier}
                        features={{}}
                    >
                        {null}
                    </UpgradeGate>
                );
            }
            return (
                <div role="status">
                    <p className="text-sm text-(--ink-muted)">{message}</p>
                </div>
            );
        case "signin":
            return (
                <div role="status" className="flex flex-col items-start gap-3">
                    <p className="text-sm text-(--ink-muted)">{message}</p>
                    <Link href="/auth/signin" className="text-sm underline">
                        {CTA_LABELS.signIn}
                    </Link>
                </div>
            );
        case "denied":
        case "allowed":
            return (
                <div role="status">
                    <p className="text-sm text-(--ink-muted)">{message}</p>
                </div>
            );
    }
}

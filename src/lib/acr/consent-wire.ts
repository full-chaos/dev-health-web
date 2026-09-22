// The body POST /api/acr/authorize returns to the consent page after an
// approve or deny: acr's own field name, passed through unchanged. The route
// builds it with toConsentDecisionWire and the page reads it through this
// type, so the two cannot drift apart.
export type OAuthConsentDecisionWire = {
    readonly redirect_url: string;
};

export function toConsentDecisionWire(decision: {
    readonly redirectUrl: string;
}): OAuthConsentDecisionWire {
    return { redirect_url: decision.redirectUrl };
}

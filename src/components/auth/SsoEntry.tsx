"use client";

import { useState } from "react";
import { CTA_LABELS } from "@/lib/design/cta";

type SsoEntryProps = {
    callbackUrl?: string;
};

const PROVIDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FIELD_CLASS =
    "w-full px-3 py-2 border rounded-md border-[var(--card-stroke)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-(--accent-2)";

// There is no provider lookup: an administrator shares the provider id, and the page goes to the
// start route of the chosen protocol.
export function SsoEntry({ callbackUrl }: SsoEntryProps) {
    const [protocol, setProtocol] = useState<"oidc" | "saml">("oidc");
    const [providerId, setProviderId] = useState("");
    const [invalid, setInvalid] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const id = providerId.trim();
        if (!PROVIDER_ID.test(id)) {
            setInvalid(true);
            return;
        }
        setInvalid(false);
        const query = callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : "";
        window.location.assign(`/auth/sso/${protocol}/${id}${query}`);
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="space-y-4 border-t border-[var(--card-stroke)] pt-6"
        >
            <div>
                <label
                    htmlFor="sso-protocol"
                    className="block text-sm font-medium text-[var(--foreground)]"
                >
                    Protocol
                </label>
                <select
                    id="sso-protocol"
                    value={protocol}
                    onChange={(e) => setProtocol(e.target.value === "saml" ? "saml" : "oidc")}
                    className={`mt-2 ${FIELD_CLASS}`}
                >
                    <option value="oidc">OpenID Connect</option>
                    <option value="saml">SAML</option>
                </select>
            </div>
            <div>
                <label
                    htmlFor="sso-provider-id"
                    className="block text-sm font-medium text-[var(--foreground)]"
                >
                    Provider ID
                </label>
                <input
                    id="sso-provider-id"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={providerId}
                    onChange={(e) => setProviderId(e.target.value)}
                    aria-invalid={invalid}
                    className={`mt-2 ${FIELD_CLASS}`}
                />
                {invalid && (
                    <p role="alert" className="mt-2 text-sm text-(--negative)">
                        Enter the provider ID your administrator shared.
                    </p>
                )}
            </div>
            <button
                type="submit"
                className="w-full py-2 px-4 border rounded-md border-[var(--card-stroke)] text-[var(--foreground)] hover:opacity-90 transition-opacity font-medium"
            >
                {CTA_LABELS.ssoContinue}
            </button>
        </form>
    );
}

"use client";

import { useState } from "react";
import { CTA_LABELS } from "@/lib/design/cta";
import type {
    SsoProtocol,
    SsoProvider,
    SsoProviderCreate,
    SsoProviderUpdate,
} from "@/lib/admin/types";

type SsoProviderFormProps = {
    mode: "create" | "edit";
    /** Required when `mode === "edit"`. */
    initialProvider?: SsoProvider;
    isSaving: boolean;
    onSaveAction: (data: SsoProviderCreate | SsoProviderUpdate) => void;
    onCancelAction: () => void;
};

const INPUT =
    "w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent-2) focus:outline-none";
const LABEL = "mb-1 block text-xs font-medium text-(--ink-muted)";

function configText(provider: SsoProvider | undefined, key: string): string {
    const value = provider?.config?.[key];
    return typeof value === "string" ? value : "";
}

function Field(props: {
    id: string;
    label: string;
    value: string;
    disabled: boolean;
    onChangeAction: (value: string) => void;
    type?: string;
    placeholder?: string;
}) {
    return (
        <div>
            <label htmlFor={props.id} className={LABEL}>
                {props.label}
            </label>
            <input
                id={props.id}
                type={props.type ?? "text"}
                placeholder={props.placeholder}
                value={props.value}
                disabled={props.disabled}
                autoComplete="off"
                onChange={(event) => props.onChangeAction(event.target.value)}
                className={INPUT}
            />
        </div>
    );
}

/**
 * Create/edit form for one SSO provider (CHAOS-13638). The API masks the client secret, so an edit
 * starts with an empty secret field and sends `client_secret` only when the admin types a new one.
 */
export function SsoProviderForm({
    mode,
    initialProvider,
    isSaving,
    onSaveAction,
    onCancelAction,
}: SsoProviderFormProps) {
    const initial = initialProvider;
    const [name, setName] = useState(initial?.name ?? "");
    const [protocol, setProtocol] = useState<SsoProtocol>(initial?.protocol ?? "oidc");
    const [isDefault, setIsDefault] = useState(initial?.is_default ?? false);
    const [allowIdpInitiated, setAllowIdpInitiated] = useState(
        initial?.allow_idp_initiated ?? false,
    );
    const [autoProvision, setAutoProvision] = useState(initial?.auto_provision_users ?? true);
    const [clientId, setClientId] = useState(configText(initial, "client_id"));
    const [clientSecret, setClientSecret] = useState("");
    const [issuer, setIssuer] = useState(configText(initial, "issuer"));
    const [entityId, setEntityId] = useState(configText(initial, "entity_id"));
    const [ssoUrl, setSsoUrl] = useState(configText(initial, "sso_url"));
    const [certificate, setCertificate] = useState("");
    const [touched, setTouched] = useState(false);

    const nameMissing = touched && name.trim() === "";

    function buildPayload(): SsoProviderCreate | SsoProviderUpdate {
        const flags = {
            is_default: isDefault,
            allow_idp_initiated: allowIdpInitiated,
            auto_provision_users: autoProvision,
        };
        if (mode === "create") {
            return protocol === "oidc"
                ? {
                      name: name.trim(),
                      protocol,
                      oidc_config: {
                          client_id: clientId.trim(),
                          client_secret: clientSecret,
                          issuer: issuer.trim(),
                      },
                      ...flags,
                  }
                : {
                      name: name.trim(),
                      protocol,
                      saml_config: {
                          entity_id: entityId.trim(),
                          sso_url: ssoUrl.trim(),
                          certificate: certificate.trim(),
                      },
                      ...flags,
                  };
        }
        const update: SsoProviderUpdate = { name: name.trim(), ...flags };
        if (protocol === "oidc") {
            update.oidc_config = { client_id: clientId.trim(), issuer: issuer.trim() };
            if (clientSecret !== "") update.oidc_config.client_secret = clientSecret;
        } else {
            update.saml_config = { entity_id: entityId.trim(), sso_url: ssoUrl.trim() };
            if (certificate.trim() !== "") update.saml_config.certificate = certificate.trim();
        }
        return update;
    }

    function handleSaveClick() {
        setTouched(true);
        if (name.trim() === "") return;
        onSaveAction(buildPayload());
    }

    return (
        <div className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-5">
            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <Field
                        id="sso-name"
                        label="Name"
                        value={name}
                        disabled={isSaving}
                        onChangeAction={setName}
                    />
                    {nameMissing ? (
                        <p role="alert" className="mt-1 text-xs text-(--negative)">
                            Enter a name.
                        </p>
                    ) : null}
                </div>
                <div>
                    <label htmlFor="sso-protocol" className={LABEL}>
                        Protocol
                    </label>
                    <select
                        id="sso-protocol"
                        value={protocol}
                        disabled={isSaving || mode === "edit"}
                        onChange={(event) => setProtocol(event.target.value as SsoProtocol)}
                        className={INPUT}
                    >
                        <option value="oidc">OIDC</option>
                        <option value="saml">SAML</option>
                    </select>
                </div>
                {protocol === "oidc" ? (
                    <>
                        <Field
                            id="sso-client-id"
                            label="Client ID"
                            value={clientId}
                            disabled={isSaving}
                            onChangeAction={setClientId}
                        />
                        <Field
                            id="sso-client-secret"
                            label="Client secret"
                            type="password"
                            value={clientSecret}
                            placeholder={
                                mode === "edit" ? "Leave blank to keep the stored secret" : ""
                            }
                            disabled={isSaving}
                            onChangeAction={setClientSecret}
                        />
                        <Field
                            id="sso-issuer"
                            label="Issuer"
                            value={issuer}
                            disabled={isSaving}
                            onChangeAction={setIssuer}
                        />
                    </>
                ) : (
                    <>
                        <Field
                            id="sso-entity-id"
                            label="Entity ID"
                            value={entityId}
                            disabled={isSaving}
                            onChangeAction={setEntityId}
                        />
                        <Field
                            id="sso-sso-url"
                            label="SSO URL"
                            value={ssoUrl}
                            disabled={isSaving}
                            onChangeAction={setSsoUrl}
                        />
                        <Field
                            id="sso-certificate"
                            label="Certificate"
                            value={certificate}
                            placeholder={
                                mode === "edit" ? "Leave blank to keep the stored certificate" : ""
                            }
                            disabled={isSaving}
                            onChangeAction={setCertificate}
                        />
                    </>
                )}
            </div>

            <div className="mt-4 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={isDefault}
                        disabled={isSaving}
                        onChange={(event) => setIsDefault(event.target.checked)}
                    />
                    Default provider
                </label>
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={allowIdpInitiated}
                        disabled={isSaving}
                        onChange={(event) => setAllowIdpInitiated(event.target.checked)}
                    />
                    Allow IdP-initiated sign-in
                </label>
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={autoProvision}
                        disabled={isSaving}
                        onChange={(event) => setAutoProvision(event.target.checked)}
                    />
                    Create users on first sign-in
                </label>
            </div>

            <div className="mt-4 flex gap-2">
                <button
                    type="button"
                    onClick={handleSaveClick}
                    disabled={isSaving}
                    className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                    {isSaving ? CTA_LABELS.savingConfiguration : CTA_LABELS.save}
                </button>
                <button
                    type="button"
                    onClick={onCancelAction}
                    disabled={isSaving}
                    className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                    {CTA_LABELS.cancel}
                </button>
            </div>
        </div>
    );
}

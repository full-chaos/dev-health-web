import { CREDENTIAL_KIND_LABELS, type CredentialKind } from "@/lib/admin/credential-kind";

const KIND_STYLES: Record<CredentialKind, string> = {
    external_push: "bg-(--info)/12 text-(--info) border-(--info)/30",
    integration: "bg-(--card-stroke) text-(--ink-muted) border-(--card-stroke)",
};

export function CredentialKindBadge({ kind }: { kind: CredentialKind }) {
    return (
        <span
            data-kind={kind}
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${KIND_STYLES[kind]}`}
        >
            {CREDENTIAL_KIND_LABELS[kind]}
        </span>
    );
}

import { StatusPill } from "@/components/admin/StatusPill";

type ProviderBadgeProps = {
    provider: string;
    username: string;
};

/**
 * A provider identity as an outlined pill, text exactly as served: `github: x` (design A4: a
 * provider is an identity, not a status, so the neutral outline, no wash, no icon).
 */
export function ProviderBadge({ provider, username }: ProviderBadgeProps) {
    return <StatusPill tone="outline">{`${provider}: ${username}`}</StatusPill>;
}

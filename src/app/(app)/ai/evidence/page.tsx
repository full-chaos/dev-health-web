import { permanentRedirect } from "next/navigation";

type AIEvidenceRedirectProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * CHAOS-2197: Evidence lives as a tab inside Governance Risk. The old
 * standalone preview route redirects there, preserving filter scope.
 */
export default async function AIEvidenceRedirect({ searchParams }: AIEvidenceRedirectProps) {
    const params = (await searchParams) ?? {};
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        const single = Array.isArray(value) ? value[0] : value;
        if (single != null) query.set(key, single);
    }
    query.set("view", "evidence");
    permanentRedirect(`/ai/risk?${query.toString()}`);
}

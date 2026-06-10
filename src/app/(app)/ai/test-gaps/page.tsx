import { permanentRedirect } from "next/navigation";

type AITestGapsRedirectProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * CHAOS-2197: Test Gaps lives as a tab inside Governance Risk. The old
 * standalone preview route redirects there, preserving filter scope.
 */
export default async function AITestGapsRedirect({ searchParams }: AITestGapsRedirectProps) {
    const params = (await searchParams) ?? {};
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        const single = Array.isArray(value) ? value[0] : value;
        if (single != null) query.set(key, single);
    }
    query.set("view", "test-gaps");
    permanentRedirect(`/ai/risk?${query.toString()}`);
}

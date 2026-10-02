import { redirect } from "next/navigation";

type CapacityRedirectProps = {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * `/capacity` was a second copy of the Completion Forecast (same upgrade gate,
 * same forecast query, same view; only the header copy differed). It redirects
 * to `/plan/capacity` and keeps the whole query string (`f`, `role`, `origin`,
 * and any other key), as `/capacity-planning` does.
 */
export default async function CapacityRedirect({ searchParams }: CapacityRedirectProps) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries((await searchParams) ?? {})) {
        if (Array.isArray(value)) {
            for (const item of value) params.append(key, item);
        } else if (value) {
            params.set(key, value);
        }
    }
    const suffix = params.toString();
    redirect(`/plan/capacity${suffix ? `?${suffix}` : ""}`);
}

import { redirect } from "next/navigation";

type AIImpactRedirectProps = {
	searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * `/ai/impact` is now the `/ai` index (Impact tab). This redirect keeps the
 * previously-reachable deep link working — and avoids two routes resolving to
 * the same Impact content — by forwarding to `/ai` with filter params intact.
 */
export default async function AIImpactRedirect({
	searchParams,
}: AIImpactRedirectProps) {
	const params = (await searchParams) ?? {};
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (typeof value === "string") {
			query.set(key, value);
		} else if (Array.isArray(value) && value.length > 0) {
			query.set(key, value[0]);
		}
	}
	const qs = query.toString();
	redirect(qs ? `/ai?${qs}` : "/ai");
}

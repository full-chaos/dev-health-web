import { redirect } from "next/navigation";

export default async function TeamFlowAlias({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[]>>;
}) {
	const params = await searchParams;
	const qs = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) {
		if (Array.isArray(v)) {
			v.forEach((x) => {
				qs.append(k, x);
			});
		} else if (v !== undefined) qs.append(k, v);
	}
	const tail = qs.toString();
	redirect(tail ? `/metrics?tab=flow&${tail}` : "/metrics?tab=flow");
}

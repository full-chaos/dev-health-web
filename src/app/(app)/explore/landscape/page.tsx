import { redirect } from "next/navigation";

import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";

type LegacyLandscapePageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function LegacyLandscapePage({ searchParams }: LegacyLandscapePageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const bucketParam = Array.isArray(params.bucket) ? params.bucket[0] : params.bucket;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;
    const bucket = bucketParam === "month" ? "?bucket=month" : "";

    redirect(withFilterParam(`/landscape${bucket}`, filters, activeRole));
}

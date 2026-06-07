import { redirect } from "next/navigation";

import {
    buildLegacyWorkRedirectTarget,
    resolveLegacyWorkRedirect,
} from "@/lib/navigation/workPageView";

type WorkPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function WorkPage({ searchParams }: WorkPageProps) {
    const params = (await searchParams) ?? {};
    const viewParam = Array.isArray(params.view) ? params.view[0] : params.view;
    const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
    const target = resolveLegacyWorkRedirect({
        view: typeof viewParam === "string" ? viewParam : undefined,
        tab: typeof tabParam === "string" ? tabParam : undefined,
    });

    redirect(buildLegacyWorkRedirectTarget(target ?? "/diagnose", params));
}

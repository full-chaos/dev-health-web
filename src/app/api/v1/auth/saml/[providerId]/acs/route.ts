import { ssoCompleteSaml } from "@/lib/authSsoRoutes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ providerId: string }> },
) {
    return ssoCompleteSaml(request, (await params).providerId);
}

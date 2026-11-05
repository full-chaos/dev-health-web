import { ssoCompleteOidc } from "@/lib/authSsoRoutes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ providerId: string }> },
) {
    return ssoCompleteOidc(request, (await params).providerId);
}

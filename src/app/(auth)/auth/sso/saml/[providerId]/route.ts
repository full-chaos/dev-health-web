import { ssoStart } from "@/lib/authSsoRoutes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ providerId: string }> },
) {
    return ssoStart(request, "saml", (await params).providerId);
}

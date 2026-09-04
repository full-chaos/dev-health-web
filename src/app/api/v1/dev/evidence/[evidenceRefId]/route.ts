import { proxyDevRequest } from "../../_proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ evidenceRefId: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
    const { evidenceRefId } = await context.params;
    const query = new URL(request.url).search;
    return proxyDevRequest(
        request,
        `/api/v1/dev/evidence/${encodeURIComponent(evidenceRefId)}${query}`,
    );
}

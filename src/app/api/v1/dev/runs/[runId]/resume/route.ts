import { proxyDevRequest } from "../../../_proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ runId: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
    const { runId } = await context.params;
    return proxyDevRequest(request, `/api/v1/dev/runs/${encodeURIComponent(runId)}/resume`, {
        mutation: true,
        stream: true,
    });
}

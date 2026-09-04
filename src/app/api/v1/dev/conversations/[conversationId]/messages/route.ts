import { proxyDevRequest } from "../../../_proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ conversationId: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
    const { conversationId } = await context.params;
    return proxyDevRequest(
        request,
        `/api/v1/dev/conversations/${encodeURIComponent(conversationId)}/messages`,
        { mutation: true, stream: true },
    );
}

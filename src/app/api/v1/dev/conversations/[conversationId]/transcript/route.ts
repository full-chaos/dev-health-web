import { proxyDevRequest } from "../../../_proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ conversationId: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
    const { conversationId } = await context.params;
    const incoming = new URL(request.url);
    const query = new URLSearchParams();
    const cursor = incoming.searchParams.get("cursor");
    const limit = incoming.searchParams.get("limit");
    if (cursor) query.set("cursor", cursor);
    if (limit) query.set("limit", limit);
    const suffix = query.size ? `?${query}` : "";

    return proxyDevRequest(
        request,
        `/api/v1/dev/conversations/${encodeURIComponent(conversationId)}/transcript${suffix}`,
    );
}

import { proxyDevRequest } from "../../_proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ conversationId: string }> };

async function path(context: Context): Promise<string> {
    return `/api/v1/dev/conversations/${encodeURIComponent((await context.params).conversationId)}`;
}

export async function GET(request: Request, context: Context): Promise<Response> {
    return proxyDevRequest(request, await path(context));
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
    return proxyDevRequest(request, await path(context), { mutation: true });
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
    return proxyDevRequest(request, await path(context), { mutation: true });
}

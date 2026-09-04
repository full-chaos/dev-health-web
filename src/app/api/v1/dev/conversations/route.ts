import { proxyDevRequest } from "../_proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
    const query = new URL(request.url).search;
    return proxyDevRequest(request, `/api/v1/dev/conversations${query}`);
}

export async function POST(request: Request): Promise<Response> {
    return proxyDevRequest(request, "/api/v1/dev/conversations", { mutation: true });
}

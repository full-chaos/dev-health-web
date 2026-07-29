import { proxyDevRequest } from "../../../_proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ answerId: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
    const { answerId } = await context.params;
    return proxyDevRequest(
        request,
        `/api/v1/dev/answers/${encodeURIComponent(answerId)}/feedback`,
        { mutation: true },
    );
}

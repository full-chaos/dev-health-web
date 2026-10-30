import {
    newRequestId,
    pathIdOrNotFound,
    prepareRead,
    readFailure,
    readSignal,
    readSuccess,
} from "@/lib/ask-dev/read.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROUTE = "GET /api/ask-dev/investigations/{resultId}";

/**
 * Replays a stored Ask Dev result. Read-only: it never starts a run (zero POST to ACR). Every
 * call re-reads the session and both entitlements and signs a fresh assertion; ACR decides
 * ownership and answers one 404 for another principal's result, another org's result and an
 * unknown id.
 */
export async function GET(
    request: Request,
    context: { params: Promise<{ resultId: string }> },
): Promise<Response> {
    const requestId = newRequestId();
    const { resultId } = await context.params;
    try {
        const id = pathIdOrNotFound(resultId, 256);
        const signal = readSignal(request);
        const prepared = await prepareRead(signal);
        const value = await prepared.client.investigationResult({
            authorization: prepared.authorization,
            requestId,
            resultId: id,
            signal,
        });
        return readSuccess(value, requestId);
    } catch (error) {
        return readFailure(error, requestId, ROUTE, { result_id: resultId.slice(0, 256) });
    }
}

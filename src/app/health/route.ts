/**
 * GET /health
 *
 * Liveness/readiness endpoint for Docker HEALTHCHECK and load-balancer probes.
 * Returns 200 OK with a JSON body when the Next.js server is running.
 *
 * This endpoint is intentionally minimal — it does NOT proxy to the backend
 * so that the web container health check is independent of backend availability.
 */
import { NextResponse } from "next/server";

export function GET() {
    return NextResponse.json({ status: "ok", ts: new Date().toISOString() }, { status: 200 });
}

import "server-only";
import type { Session } from "next-auth";

/**
 * The session read for modules that run on the server AND in a browser (`apiClient`, the GraphQL
 * fetchers). This file is the server variant: `#server-session` resolves to it only in a server
 * module graph (the `react-server` condition: server components, route handlers, server actions,
 * the proxy). Every other graph gets `serverSession.default.ts`, so the auth module is never part
 * of a browser bundle. `package.json` ("imports") holds the mapping.
 *
 * The auth module is loaded on the first call, not at import: a caller that never needs a session
 * does not load it.
 */
export async function readServerSession(): Promise<Session | null> {
    const { auth } = await import("@/lib/auth");
    return auth();
}

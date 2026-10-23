import type { Session } from "next-auth";
import { ValidationErrors } from "@/lib/constants/errors";
import { logger } from "@/lib/logger";

/**
 * The variant of `#server-session` for every module graph that is not a server graph: the browser
 * bundle and the server render of a client component. It has no import of the auth module, which
 * is server-only.
 *
 * There is no session to read here, so the read rejects. Each caller already treats a failed
 * session read as "no session": the request goes without a token and the backend decides.
 */
export async function readServerSession(): Promise<Session | null> {
    if (typeof window === "undefined") {
        // A client component that reads data while the server renders it. Loud, because the
        // request then goes without a token: move the read to a server component.
        logger.error(
            "[server-session] session read from a client component module graph during the server render; no token is sent",
        );
    }
    throw new Error(ValidationErrors.ServerEnvCalledFromClientBundle);
}

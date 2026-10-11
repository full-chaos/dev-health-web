import { z } from "zod";
import { assertNotClientBundle } from "@/lib/serverEnvGuard";
import type { ServerEnv } from "./serverEnv.server";

/**
 * The default variant of `#server-env` (see `config.ts`): the reader for every module graph that is
 * not a server graph, that is the browser bundle and the server render of a client component.
 * It holds only the variables that code in those graphs reads (the backend URL, the log settings,
 * the analytics flag). Any other variable is refused with a loud error: read it in a server
 * component, a route handler or a server action.
 */
const clientGraphEnvSchema = z.object({
    NODE_ENV: z.string().optional(),
    LOG_LEVEL: z.string().optional(),
    LOG_FORMAT: z.string().optional(),
    BACKEND_URL: z.string().optional(),
    USE_GRAPHQL_ANALYTICS: z.string().optional(),
});

const ALLOWED_KEYS = new Set(Object.keys(clientGraphEnvSchema.shape));
const ENV_KEY = /^[A-Z][A-Z0-9_]*$/;

export type { ServerEnv };

export function getServerEnv(): ServerEnv {
    assertNotClientBundle();
    const parsed = clientGraphEnvSchema.parse(process.env) as Record<string, unknown>;
    return new Proxy(parsed, {
        get(target, prop) {
            if (typeof prop === "string" && ENV_KEY.test(prop) && !ALLOWED_KEYS.has(prop)) {
                throw new Error(
                    `[server-env] ${prop} is not available in a client module graph; read it in a server component, route handler or server action`,
                );
            }
            return Reflect.get(target, prop);
        },
    }) as ServerEnv;
}

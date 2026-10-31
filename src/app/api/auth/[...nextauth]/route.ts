import { handlers as authJsHandlers } from "@/lib/auth";
import { browserSafeAuthHandlers } from "@/lib/authBrowserSession";

// CHAOS-12088: the browser gets the session without the Ops tokens, and cannot write tokens into it.
const handlers = browserSafeAuthHandlers(authJsHandlers);
export const { GET, POST } = handlers;

import { z } from "zod";

/**
 * The production CSP has no `'unsafe-eval'`, so Zod's JIT can never run in a browser here. With
 * `jitless` off, Zod still probes for it with `Function("")`: the probe is caught, but the page logs
 * a blocked `eval` that reads like an attack (CHAOS-11939). Next runs this file before hydration.
 */
z.config({ jitless: true });

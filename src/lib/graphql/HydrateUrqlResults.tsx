"use client";

/**
 * Bridges server-fetched urql results into the browser's `ssrExchange` cache
 * (CHAOS-1276 Phase C). Rendering this component BEFORE a descendant
 * `useQuery` with matching query + variables lets that query resolve
 * synchronously from cache — no second network fetch.
 *
 * Restoration runs in a lazy `useState` initializer so it happens exactly
 * once during the first render of this component (synchronously, before any
 * child effects or `useQuery` subscriptions in sibling/descendant trees).
 */

import { useState } from "react";
import type { SSRData } from "@urql/core";
import { useSsr } from "./provider";

export function HydrateUrqlResults({ payload }: { payload: SSRData | null | undefined }): null {
    const ssr = useSsr();

    useState(() => {
        if (ssr && payload) {
            ssr.restoreData(payload);
        }
        return null;
    });

    return null;
}

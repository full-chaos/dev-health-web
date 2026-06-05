"use client";

/**
 * WebVitalsReporter — client component that initialises Web Vitals collection.
 *
 * Render once in the root layout. Has no visible output.
 *
 * @example
 * // In src/app/layout.tsx:
 * import { WebVitalsReporter } from "@/components/WebVitalsReporter";
 * // …
 * <body>
 *   <WebVitalsReporter />
 *   {children}
 * </body>
 */
import { useEffect } from "react";
import { initWebVitals } from "@/lib/webVitals";

export function WebVitalsReporter(): null {
    useEffect(() => {
        initWebVitals();
    }, []);

    return null;
}

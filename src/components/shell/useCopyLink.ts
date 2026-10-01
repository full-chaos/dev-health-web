"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

/**
 * Copy the page URL with its state (`f`, `role`, `lens`, …). When the clipboard
 * is not available the URL is given back as `fallbackUrl`, to show in a field:
 * the action is never a silent no-op.
 */
export function useCopyLink() {
    const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

    const copyLink = useCallback(async () => {
        const url = window.location.href;
        try {
            if (!navigator.clipboard?.writeText) {
                throw new Error("clipboard unavailable");
            }
            await navigator.clipboard.writeText(url);
            setFallbackUrl(null);
            toast.success("Link copied");
        } catch {
            setFallbackUrl(url);
        }
    }, []);

    const dismissFallback = useCallback(() => setFallbackUrl(null), []);

    return { copyLink, dismissFallback, fallbackUrl };
}

import { Notice } from "@/components/ui/Notice";

/**
 * Shown when the session carries no organization. The page makes no request in
 * that case (never an empty or made-up org), so it says so in one plain sentence.
 */
export function NoOrgNotice() {
    return (
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <Notice variant="warn" live={false}>
                This session has no organization selected, so nothing was loaded.
            </Notice>
        </div>
    );
}

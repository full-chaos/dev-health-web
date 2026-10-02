import { publicEnv } from "@/lib/config";

const showBeta = publicEnv.NEXT_PUBLIC_BETA !== "false";

export function BetaBadge() {
    if (!showBeta) return null;
    return (
        <span className="rounded-full border border-(--accent-3)/30 bg-(--accent-3)/12 px-2 py-0.5 text-label-caps font-semibold uppercase tracking-[0.15em] text-(--accent-3)">
            Beta
        </span>
    );
}

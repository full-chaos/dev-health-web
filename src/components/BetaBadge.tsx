import { publicEnv } from "@/lib/config";

const showBeta = publicEnv.NEXT_PUBLIC_BETA !== "false";

export function BetaBadge() {
  if (!showBeta) return null;
  return (
    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-400">
      Beta
    </span>
  );
}

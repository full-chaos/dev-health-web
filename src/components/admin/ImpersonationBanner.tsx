"use client";

import { useSession } from "next-auth/react";
import { stopImpersonation } from "@/lib/admin/server";
import { useRouter } from "next/navigation";

export function ImpersonationBanner() {
    const { data: session } = useSession();
    const router = useRouter();

    if (!session?.user?.is_impersonating) {
        return null;
    }

    const handleStopImpersonation = async () => {
        const result = await stopImpersonation();
        if (!result?.error) {
            router.refresh();
            router.push("/superadmin");
        }
    };

    return (
        <div className="w-full bg-amber-500 text-black px-4 py-3 text-center shadow-md flex items-center justify-center gap-4 z-[100] relative">
            <span className="font-medium">
                Viewing as {session.user.email || session.user.impersonated_user_id}
            </span>
            <button
                type="button"
                onClick={handleStopImpersonation}
                className="bg-black/10 hover:bg-black/20 text-black px-3 py-1 rounded text-sm font-semibold transition-colors"
            >
                Stop Impersonating
            </button>
        </div>
    );
}

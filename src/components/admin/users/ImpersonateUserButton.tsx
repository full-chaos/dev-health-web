"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { startImpersonation } from "@/lib/admin/server";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { User } from "@/lib/admin/types";

export function ImpersonateUserButton({ user }: { user: User }) {
    const { data: session } = useSession();
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const canImpersonate =
        session?.user?.id !== user.id && !user.is_superuser && user.role !== "admin";

    if (!canImpersonate) {
        return null;
    }

    const handleImpersonate = async () => {
        setLoading(true);
        try {
            const result = await startImpersonation(user.id);
            if (result.error) {
                toast.error(result.error);
                return;
            }
            if (result.data) {
                router.refresh();
                router.push("/dashboard");
            }
        } catch {
            toast.error("Failed to start impersonation");
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handleImpersonate}
            disabled={loading}
            className="block w-full rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-500 hover:bg-amber-500/20 text-left transition-colors disabled:opacity-50"
        >
            {loading ? "Impersonating…" : "Impersonate User"}
        </button>
    );
}

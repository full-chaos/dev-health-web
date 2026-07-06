import { AdminHeader } from "@/components/admin/AdminHeader";
import { FirstRunSync, type GithubAppArrival } from "@/components/onboarding/FirstRunSync";
import { auth } from "@/lib/auth";
import { getSetupStatus } from "@/lib/admin/server";
import type { SetupStatus } from "@/lib/onboarding/types";

/**
 * CHAOS-2681 first-run sync surface. The return-aware GitHub App install
 * callback (C4) lands the user here after connect, so the next step is an
 * actual sync (repo selection → start sync) rather than a dead credential page.
 * Reads the C2 setup status server-side and renders the lifecycle-aware UI.
 */

const DISCONNECTED_STATUS: SetupStatus = {
    has_integration: false,
    providers: [],
    has_sync_config: false,
    sync_config_id: null,
    first_sync_started: false,
    first_sync_completed: false,
    sync_status: "none",
    selected_repositories_count: 0,
    last_sync_error: null,
    can_start_sync: false,
    next_action: "connect_integration",
    blocker: null,
};

export default async function FirstRunSyncPage({
    searchParams,
}: {
    searchParams: Promise<{ github_app?: string | string[] }>;
}) {
    const { github_app: githubApp } = await searchParams;
    const arrival: GithubAppArrival | undefined =
        githubApp === "connected" || githubApp === "error" ? githubApp : undefined;

    const [session, statusResult] = await Promise.all([auth(), getSetupStatus()]);
    const status = statusResult.data ?? DISCONNECTED_STATUS;
    const orgId = session?.user?.org_id ?? null;

    return (
        <div>
            <AdminHeader
                title="GitHub sync"
                description="Finish first-run setup: choose repositories and start your first sync."
            />
            <FirstRunSync status={status} arrival={arrival} orgId={orgId} />
        </div>
    );
}

import { AdminHeader } from "@/components/admin/AdminHeader";
import { Notice } from "@/components/ui/Notice";
import { RetryButton } from "@/components/ui/RetryButton";
import { logger } from "@/lib/logger";
import {
    ConnectorStatusTable,
    type ConnectorStatusItem,
} from "../_components/ConnectorStatusTable";
import { graphqlFetch } from "@/lib/graphql/urqlClient";
import {
    GetConnectorsDataHealthDocument,
    type GetConnectorsDataHealthQuery,
} from "@/lib/graphql/__generated__/graphql";
import { requireSession } from "@/lib/auth";

export default async function ConnectorsHealthPage() {
    const session = await requireSession();

    // Need to get team. For admin operator level, there's no single team ID,
    // but if the schema requires a team, we might need a default team from session or hardcoded for now,
    // or maybe the schema means orgId instead of team, but we'll pass a default if needed.
    // Actually, for global Data Health, "teamId" might just be "global" or something, but we'll use "current" or some dummy value
    // Let's see what operatingReviewFetchers uses.
    const teamId = session.user.org_id || "default";

    let data: ConnectorStatusItem[] = [];
    let error: string | null = null;

    try {
        const res = await graphqlFetch<GetConnectorsDataHealthQuery>(
            GetConnectorsDataHealthDocument.toString(),
            { teamId },
        );
        data = res.dataHealth.connectors as ConnectorStatusItem[];
    } catch (e) {
        // The failure goes to the log; the page says one plain sentence + Retry.
        logger.error({ err: e }, "Failed to load connectors health");
        error = "Failed to load connectors health";
    }

    return (
        <div className="space-y-8">
            <AdminHeader
                title="Data Confidence"
                description="Freshness, errors, and status of all configured providers."
            />

            {error ? (
                <Notice variant="danger" live={false} action={<RetryButton />}>
                    Connector health could not be loaded. Retry, or check again in a moment.
                </Notice>
            ) : (
                <ConnectorStatusTable data={data} />
            )}
        </div>
    );
}

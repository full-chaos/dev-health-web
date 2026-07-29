import { AdminHeader } from "@/components/admin/AdminHeader";
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
import { DataHealthAskDevTrigger } from "../_components/DataHealthAskDevTrigger";

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
        error = e instanceof Error ? e.message : "Failed to load connectors health";
    }

    return (
        <div className="space-y-8">
            <AdminHeader
                title="Connector Health"
                description="Freshness, errors, and status of all configured providers."
            >
                <DataHealthAskDevTrigger />
            </AdminHeader>

            {error ? (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-500">
                    Failed to load data: {error}
                </div>
            ) : (
                <ConnectorStatusTable data={data} />
            )}
        </div>
    );
}

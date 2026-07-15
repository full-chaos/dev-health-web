import { BackLink } from "@/components/shared/BackLink";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { getCurrentOrg, getOrgEntitlements } from "@/lib/admin/server";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { filterFromQueryParams } from "@/lib/filters/encode";
import { ContextPacketGatedBody } from "./_components/ContextPacketGatedBody";
import {
    CONTROLLED_PACKET_STATES,
    type ControlledPacketState,
} from "./_components/contextPacketStates";

type ContextPacketPageProps = {
    readonly searchParams?: Promise<{ readonly [key: string]: string | string[] | undefined }>;
};

function controlledStateFrom(
    value: string | string[] | undefined,
    testMode: boolean,
): ControlledPacketState {
    const candidate = Array.isArray(value) ? value[0] : value;
    const controlledState = CONTROLLED_PACKET_STATES.find((state) => state === candidate);
    return testMode && controlledState !== undefined ? controlledState : "sample";
}

export default async function ContextPacketPage({ searchParams }: ContextPacketPageProps) {
    const params = (await searchParams) ?? {};
    const filters = filterFromQueryParams(params);
    const testMode =
        process.env.DEV_HEALTH_TEST_MODE === "true" ||
        process.env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";
    const org = await fetchOrNull(getCurrentOrg(), "agent-context/current-org");
    const entitlements = org?.data?.id
        ? await fetchOrNull(getOrgEntitlements(org.data.id), "agent-context/entitlements")
        : null;
    const enabled =
        testMode ||
        (entitlements?.data?.is_valid === true &&
            entitlements.data.features["agent_context_runtime"] === true);

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <main className="order-2 min-w-0 flex-1 md:order-2">
                    <div className="mb-6">
                        <BackLink href="/diagnose" area="Diagnose" />
                    </div>
                    <ContextPacketGatedBody
                        enabled={enabled}
                        controlledState={controlledStateFrom(params.state, testMode)}
                    />
                </main>
                <div className="order-1 md:order-1">
                    <PrimaryNav filters={filters} active="diagnose" />
                </div>
            </div>
        </div>
    );
}

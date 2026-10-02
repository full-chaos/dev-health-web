import { AdminHeader } from "@/components/admin/AdminHeader";
import { ContextPacketGatedBody } from "@/app/(app)/agent-context/context-packet/_components/ContextPacketGatedBody";
import {
    CONTROLLED_PACKET_STATES,
    type ControlledPacketState,
} from "@/app/(app)/agent-context/context-packet/_components/contextPacketStates";
import {
    repositoryCatalogFrom,
    type RepositoryCatalog,
} from "@/app/(app)/agent-context/context-packet/_components/repositoryCatalog";
import { getCurrentOrg } from "@/lib/admin/server";
import { AcrRuntimeError } from "@/lib/acr/errors";
import { listAuthorizedRepositories } from "@/lib/acr/service";
import { fetchOrNull } from "@/lib/fetchOrNull";

type ContextFabricValidationPageProps = {
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

/**
 * Platform-admin validation remains an ACR capability surface. It does not use
 * Ask Dev's LLM provider, conversation, retention, or quota decisions.
 */
export default async function ContextFabricValidationPage({
    searchParams,
}: ContextFabricValidationPageProps) {
    const params = (await searchParams) ?? {};
    const testMode = process.env.DEV_HEALTH_TEST_MODE === "true";
    const org = await fetchOrNull(getCurrentOrg(), "context-fabric-validation/current-org");
    let repositoryCatalog: RepositoryCatalog | undefined;

    if (!testMode && org?.data?.id) {
        try {
            repositoryCatalog = repositoryCatalogFrom(
                await listAuthorizedRepositories(org.data.id),
            );
        } catch (error) {
            if (!(error instanceof AcrRuntimeError)) throw error;
            repositoryCatalog = { kind: "error" };
        }
    }

    return (
        <div className="space-y-6">
            <AdminHeader
                title="Context Fabric Validation"
                description="Validate scoped context retrieval independently from Ask Dev conversations and model configuration."
            />
            <ContextPacketGatedBody
                enabled
                controlledState={controlledStateFrom(params.state, testMode)}
                live={!testMode}
                repositoryCatalog={repositoryCatalog}
                showRetrievalDebug
            />
        </div>
    );
}

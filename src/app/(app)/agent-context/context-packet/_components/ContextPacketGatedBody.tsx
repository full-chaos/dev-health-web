import { DataState } from "@/components/ui/DataState";
import { ContextPacketExplorer } from "./ContextPacketExplorer";
import type { ControlledPacketState } from "./contextPacketStates";
import type { RepositoryCatalog } from "./repositoryCatalog";

type ContextPacketGatedBodyProps = {
    readonly enabled: boolean;
    readonly controlledState: ControlledPacketState;
    readonly live?: boolean;
    readonly repositories?: readonly string[];
    readonly repositoryCatalog?: RepositoryCatalog;
    readonly showRetrievalDebug?: boolean;
};

export function ContextPacketGatedBody({
    enabled,
    controlledState,
    live = false,
    repositories,
    repositoryCatalog,
    showRetrievalDebug = false,
}: ContextPacketGatedBodyProps) {
    if (!enabled) {
        return <ContextPacketPreviewPlaceholder />;
    }
    return (
        <ContextPacketExplorer
            controlledState={controlledState}
            live={live}
            repositories={repositories}
            repositoryCatalog={repositoryCatalog}
            showRetrievalDebug={showRetrievalDebug}
        />
    );
}

function ContextPacketPreviewPlaceholder() {
    return (
        <DataState
            variant="no-data-connected"
            title="Agent Context Runtime is not available for this organization"
            description="Ask an organization administrator to review product access."
            data-testid="data-state-not-entitled"
        />
    );
}

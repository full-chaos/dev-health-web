import { DataState } from "@/components/ui/DataState";
import { ContextPacketExplorer } from "./ContextPacketExplorer";
import type { ControlledPacketState } from "./contextPacketStates";

type ContextPacketGatedBodyProps = {
    readonly enabled: boolean;
    readonly controlledState: ControlledPacketState;
    readonly live?: boolean;
    readonly showRetrievalDebug?: boolean;
};

export function ContextPacketGatedBody({
    enabled,
    controlledState,
    live = false,
    showRetrievalDebug = false,
}: ContextPacketGatedBodyProps) {
    if (!enabled) {
        return <ContextPacketPreviewPlaceholder />;
    }
    return (
        <ContextPacketExplorer
            controlledState={controlledState}
            live={live}
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

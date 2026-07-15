import { DataState } from "@/components/ui/DataState";
import { ContextPacketExplorer } from "./ContextPacketExplorer";
import type { ControlledPacketState } from "./contextPacketStates";

type ContextPacketGatedBodyProps = {
    readonly enabled: boolean;
    readonly controlledState: ControlledPacketState;
};

export function ContextPacketGatedBody({ enabled, controlledState }: ContextPacketGatedBodyProps) {
    if (!enabled) {
        return <ContextPacketPreviewPlaceholder />;
    }
    return <ContextPacketExplorer controlledState={controlledState} />;
}

function ContextPacketPreviewPlaceholder() {
    return (
        <div className="flex flex-col gap-6">
            <DataState
                variant="no-data-connected"
                title="Agent Context Runtime is not available for this organization"
                description="Ask an organization administrator to review product access."
                data-testid="data-state-not-entitled"
            />
            <div
                aria-hidden="true"
                data-testid="context-packet-preview-placeholder"
                className="grid gap-4 lg:grid-cols-2"
            >
                <div className="h-40 rounded-(--radius-lg) border border-(--card-stroke) bg-(--card-80)" />
                <div className="h-40 rounded-(--radius-lg) border border-(--card-stroke) bg-(--card-80)" />
            </div>
        </div>
    );
}

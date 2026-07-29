import { AskDevTrigger } from "@/components/ask-dev/AskDevTrigger";

export function DataHealthAskDevTrigger() {
    return (
        <AskDevTrigger
            context={{
                routeId: "data_health",
                entityRefs: [],
                suggestedQuestionIds: ["data_trust", "observed_change"],
            }}
        />
    );
}

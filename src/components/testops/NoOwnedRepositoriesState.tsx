import { FolderOpen } from "lucide-react";

import { DataState } from "@/components/ui/DataState";
import { NO_OWNED_REPOSITORIES } from "@/app/(app)/testops/testOpsEvidence";

/**
 * The state of a selected team that owns no repository: not healthy, not 0, not "no data". The icon is an open folder: the
 * variant default is an hourglass, which reads as loading.
 */
export function NoOwnedRepositoriesState({ compact = false }: { compact?: boolean }) {
    return (
        <DataState
            variant="insufficient-confidence"
            title={NO_OWNED_REPOSITORIES}
            description="The selected team owns no repository, so there is nothing to show for it."
            icon={<FolderOpen aria-hidden="true" />}
            compact={compact}
            data-testid="testops-no-owned-repositories"
        />
    );
}

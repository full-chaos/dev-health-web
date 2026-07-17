import { DataState } from "@/components/ui/DataState";
import { CTA_LABELS } from "@/lib/design/cta";
import type { RepositoryCatalog } from "./repositoryCatalog";

type RepositoryDiscoveryStateProps = {
    readonly catalog: RepositoryCatalog;
    readonly isRetrying: boolean;
    readonly onRetry: () => void;
};

export function RepositoryDiscoveryState({
    catalog,
    isRetrying,
    onRetry,
}: RepositoryDiscoveryStateProps) {
    if (catalog.kind === "error") {
        return (
            <DataState
                variant="error"
                title="Repositories could not be loaded"
                message="Try again to load the repositories you are authorized to use."
                action={
                    <button
                        type="button"
                        disabled={isRetrying}
                        onClick={onRetry}
                        className="rounded-(--radius-sm) border border-(--card-stroke) px-3 py-2 text-sm font-semibold text-foreground hover:bg-(--card-70) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50 disabled:cursor-wait disabled:opacity-60"
                    >
                        {CTA_LABELS.retry}
                    </button>
                }
                className="md:col-span-2"
                data-testid="repository-discovery-error"
            />
        );
    }

    if (catalog.kind === "empty") {
        return (
            <DataState
                variant="detector-enabled-no-findings"
                title="No repositories are available"
                description="No repositories are available in your authorized catalog. Ask an organization administrator to review access."
                className="md:col-span-2"
                data-testid="repository-discovery-empty"
            />
        );
    }

    return null;
}

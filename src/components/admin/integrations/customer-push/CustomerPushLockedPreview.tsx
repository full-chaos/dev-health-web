export function CustomerPushLockedPreview() {
    return (
        <div className="space-y-4 p-6">
            <div className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6">
                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                    Customer push
                </p>
                <h2 className="mt-2 font-(--font-display) text-2xl text-foreground">
                    Bring your own ingestion runner
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-(--ink-muted)">
                    Register source instances, generate scoped ingest credentials, validate
                    payloads, and monitor batches pushed by customer-owned infrastructure.
                </p>
            </div>
        </div>
    );
}

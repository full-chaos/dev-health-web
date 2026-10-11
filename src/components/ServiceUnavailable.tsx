import Link from "next/link";
import { CTA_LABELS } from "@/lib/design/cta";

type ServiceUnavailableProps = {
    /**
     * Render the content as the page's `<main>` landmark (default). A page inside
     * the shared app shell passes `false`: the shell already owns `<main>`.
     */
    landmark?: boolean;
};

export function ServiceUnavailable({ landmark = true }: ServiceUnavailableProps = {}) {
    const Content = landmark ? "main" : "div";
    return (
        <div className="min-h-screen bg-background text-foreground">
            <Content className="mx-auto flex w-full max-w-3xl flex-col items-start gap-6 px-6 pb-20 pt-16">
                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                    Full Chaos Dev Health Ops
                </p>
                <h1 className="font-(--font-display) text-3xl">Service unavailable</h1>
                <p className="text-sm text-(--ink-muted)">
                    The service is down right now. Please check back soon.
                </p>
                <Link
                    href="/dashboard"
                    className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em]"
                >
                    {CTA_LABELS.retry}
                </Link>
            </Content>
        </div>
    );
}

import type { ReactNode } from "react";

type AITabPreviewProps = {
	/** What this future tab will surface, in system-health language. */
	children: ReactNode;
	/** Where the underlying signal lives today, so the tab is never a dead end. */
	whereNow?: { label: string; href: string };
};

export function AITabPreview({ children, whereNow }: AITabPreviewProps) {
	return (
		<section
			data-testid="ai-tab-preview"
			className="rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-70) p-8"
		>
			<span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.15em] text-amber-400">
				Preview
			</span>
			<p className="mt-4 max-w-2xl text-sm text-(--ink-muted)">{children}</p>
			{whereNow ? (
				<a
					href={whereNow.href}
					className="mt-5 inline-block text-xs uppercase tracking-[0.2em] text-(--accent-2) underline-offset-4 hover:underline"
				>
					{whereNow.label} →
				</a>
			) : null}
		</section>
	);
}

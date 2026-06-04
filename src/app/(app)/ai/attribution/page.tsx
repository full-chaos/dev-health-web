import { AIPageHeader } from "@/components/ai/AIPageHeader";
import { AITabPreview } from "@/components/ai/AITabPreview";

/**
 * Attribution tab — preview. The attribution mix currently lives as panels
 * inside Impact. Marked preview rather than fabricating a separate surface.
 */
export default function AIAttributionPage() {
	return (
		<>
			<AIPageHeader eyebrow="AI" title="Attribution">
				A dedicated home for PR attribution — how work splits across human,
				AI-assisted, AI-reviewed, agent-created, and unknown buckets — is
				coming. Today these panels live within Impact.
			</AIPageHeader>
			<AITabPreview
				whereNow={{
					label: "View attribution mix in Impact",
					href: "/ai/impact",
				}}
			>
				Attribution diagnostics will move here when they can stand as a complete
				view. For now the same signals — including the unknown bucket kept
				visible for coverage gaps — appear on the Impact tab.
			</AITabPreview>
		</>
	);
}

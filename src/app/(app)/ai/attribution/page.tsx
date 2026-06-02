import { AIPageHeader } from "@/components/ai/AIPageHeader";
import { AITabPreview } from "@/components/ai/AITabPreview";

/**
 * Attribution tab — preview. The attribution mix (human / assisted / review /
 * agent-created / unknown) currently lives as panels inside the Impact tab and
 * has not been split into its own backing query yet. Marked preview rather than
 * fabricating a separate data surface.
 */
export default function AIAttributionPage() {
	return (
		<>
			<AIPageHeader eyebrow="AI Workflows" title="Attribution">
				A dedicated home for PR attribution — how work splits across human,
				AI-assisted, AI-reviewed, agent-created, and unknown buckets — is
				coming. Today these panels live within Impact.
			</AIPageHeader>
			<AITabPreview
				whereNow={{ label: "View attribution mix in Impact", href: "/ai" }}
			>
				Attribution diagnostics will move here once the attribution mix is split
				from the Impact summary into its own scoped query. For now the same
				signals — including the unknown bucket kept visible for coverage gaps —
				appear on the Impact tab.
			</AITabPreview>
		</>
	);
}

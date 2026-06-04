import { AIPageHeader } from "@/components/ai/AIPageHeader";
import { AITabPreview } from "@/components/ai/AITabPreview";

/**
 * Evidence tab — preview. A consolidated evidence view under the AI area is
 * scoped but not ready, so it is marked preview rather than rendering an empty
 * evidence panel.
 */
export default function AIEvidencePage() {
	return (
		<>
			<AIPageHeader eyebrow="AI" title="AI Evidence">
				A consolidated evidence trail for AI signals is coming. Today the
				closest summary lives on the Operating Review.
			</AIPageHeader>
			<AITabPreview
				whereNow={{
					label: "View AI summary on Operating Review",
					href: "/operating-review#ai-workflow-intelligence",
				}}
			>
				Evidence will surface here when it can stand as a complete view. No
				fabricated evidence is shown before that data is available.
			</AITabPreview>
		</>
	);
}

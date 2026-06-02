import { AIPageHeader } from "@/components/ai/AIPageHeader";
import { AITabPreview } from "@/components/ai/AITabPreview";

/**
 * Evidence tab — preview. The "AI Workflow Intelligence" summary currently
 * lives on the dashboard and operating-review surfaces. A consolidated evidence
 * view under the AI area is scoped but not yet backed by its own data, so it is
 * marked preview rather than rendering an empty evidence panel.
 */
export default function AIEvidencePage() {
	return (
		<>
			<AIPageHeader eyebrow="AI Workflows" title="Evidence">
				A consolidated evidence trail for AI workflow signals — tracing each
				pattern back to Work Graph edges and source PRs — is coming. Today the
				AI Workflow Intelligence summary lives on the Operating Review.
			</AIPageHeader>
			<AITabPreview
				whereNow={{
					label: "View AI Workflow Intelligence on Operating Review",
					href: "/operating-review#ai-workflow-intelligence",
				}}
			>
				Evidence will surface here once AI workflow signals are linked to their
				underlying Work Graph edges. No fabricated evidence is shown until that
				data is available.
			</AITabPreview>
		</>
	);
}

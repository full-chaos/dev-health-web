import { AIPageHeader } from "@/components/ai/AIPageHeader";
import { AITabPreview } from "@/components/ai/AITabPreview";

/**
 * Test Gaps tab — preview. Test-gap signals currently render as a panel inside
 * Governance Risk. Marked preview rather than duplicating the Risk panel.
 */
export default function AITestGapsPage() {
	return (
		<>
			<AIPageHeader eyebrow="AI" title="Test Gaps">
				A focused view of where AI-attributed change appears to land without
				matching test coverage signals is coming. Today the test-gap rate is
				surfaced inside Governance Risk.
			</AIPageHeader>
			<AITabPreview
				whereNow={{
					label: "View test gap rate in Governance Risk",
					href: "/ai/risk",
				}}
			>
				Test-gap diagnostics will move here when they can stand as a complete
				view. For now the test-gap rate and its baseline delta appear on the
				Governance Risk tab.
			</AITabPreview>
		</>
	);
}

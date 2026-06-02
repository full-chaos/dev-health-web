import { ReactNode } from "react";

import { AIWorkspaceChrome } from "@/components/ai/AIWorkspaceChrome";

/**
 * Shared layout for the unified "AI Workflows" area. Provides one sidebar entry
 * (PrimaryNav active="ai-workflows") and one tab strip so every AI surface —
 * Impact, Attribution, Review Load, Test Gaps, Governance Risk, Evidence,
 * Automations — lives behind a single coherent chrome.
 */
export default function AILayout({ children }: { children: ReactNode }) {
	return <AIWorkspaceChrome>{children}</AIWorkspaceChrome>;
}

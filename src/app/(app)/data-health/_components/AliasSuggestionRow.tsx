"use client";

import { ProviderBadge } from "@/components/admin/identities/ProviderBadge";

type AliasSuggestion = {
    unmappedIdentity: {
        provider: string;
        email?: string | null;
        displayName?: string | null;
    };
    suggestedCanonicalId: string;
    confidence: number;
};

export function AliasSuggestionRow({ suggestion }: { suggestion: AliasSuggestion }) {
    const { unmappedIdentity, suggestedCanonicalId, confidence } = suggestion;

    const handleConfirm = () => {
        // TODO: implement mutation to map alias
        console.log("TODO: Confirm mapping", {
            unmappedIdentity,
            suggestedCanonicalId,
        });
        alert("Mapping identity is not yet implemented.");
    };

    return (
        <div className="flex items-center justify-between p-4 hover:bg-(--card-70) transition-colors">
            <div className="flex items-center gap-6">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <ProviderBadge
                            provider={unmappedIdentity.provider}
                            username={unmappedIdentity.email ?? unmappedIdentity.displayName ?? ""}
                        />
                        <span className="font-medium text-foreground">
                            {unmappedIdentity.displayName || unmappedIdentity.email || "Unknown"}
                        </span>
                    </div>
                    <div className="text-xs text-(--ink-muted)">{unmappedIdentity.email}</div>
                </div>

                <div className="text-(--ink-muted)">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M14 5l7 7m0 0l-7 7m7-7H3"
                        />
                    </svg>
                </div>

                <div>
                    <div className="text-xs text-(--ink-muted) mb-1 uppercase tracking-wider">
                        Suggested Canonical
                    </div>
                    <div className="font-mono text-sm text-(--accent)">{suggestedCanonicalId}</div>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="text-xs text-(--ink-muted)">
                    {(confidence * 100).toFixed(0)}% match
                </div>
                <button
                    onClick={handleConfirm}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
                >
                    Confirm Mapping
                </button>
            </div>
        </div>
    );
}

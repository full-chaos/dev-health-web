export const CTA_LABELS = {
  openLandscapes: "Open landscapes",
  openEvidence: "Open evidence",
  closeEvidencePanel: "Close evidence panel",
  closePanel: "Close panel",
  exploreWork: "Explore work",
  openFlame: "Open flame",
  backToCockpit: "Back to cockpit",
  backToMetrics: "Back to metrics",
} as const;

export type CtaLabel = (typeof CTA_LABELS)[keyof typeof CTA_LABELS];

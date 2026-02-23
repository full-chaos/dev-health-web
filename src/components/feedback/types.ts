export type FeedbackType = "bug" | "feature" | "question";

export type FeedbackPayload = {
  title: string;
  description: string;
  type: FeedbackType;
  url: string;
  userAgent: string;
  timestamp: string;
};

export type FeedbackResponse = {
  success: boolean;
  issueUrl?: string;
  issueId?: string;
  error?: string;
};

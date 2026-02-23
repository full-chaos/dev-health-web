import { NextResponse } from "next/server";

import type { FeedbackPayload, FeedbackResponse } from "@/components/feedback/types";

const LINEAR_ENDPOINT = "https://api.linear.app/graphql";
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;

const requestLog = new Map<string, number[]>();

const ISSUE_CREATE_MUTATION = `
  mutation IssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        id
        identifier
        url
      }
    }
  }
`;

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (!forwardedFor) {
    return "unknown";
  }

  return forwardedFor.split(",")[0]?.trim() || "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const requests = requestLog.get(ip) ?? [];
  const recentRequests = requests.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestLog.set(ip, recentRequests);
    return true;
  }

  recentRequests.push(now);
  requestLog.set(ip, recentRequests);
  return false;
}

function getPriority(type: FeedbackPayload["type"]): number {
  switch (type) {
    case "bug":
      return 2;
    case "feature":
      return 3;
    case "question":
      return 4;
    default:
      return 4;
  }
}

function buildDescription(payload: FeedbackPayload): string {
  return `${payload.description.trim()}\n\n---\n\n**Feedback Metadata**\n- URL: ${payload.url}\n- User Agent: ${payload.userAgent}\n- Timestamp: ${payload.timestamp}\n- Type: ${payload.type}`;
}

function badRequest(error: string) {
  const response: FeedbackResponse = {
    success: false,
    error,
  };

  return NextResponse.json(response, { status: 400 });
}

export async function POST(request: Request) {
  const linearApiKey = process.env.LINEAR_API_KEY;
  const linearTeamId = process.env.LINEAR_TEAM_ID;

  if (!linearApiKey || !linearTeamId) {
    const response: FeedbackResponse = {
      success: false,
      error: "Feedback service not configured",
    };

    return NextResponse.json(response, { status: 503 });
  }

  const ip = getClientIp(request);

  if (isRateLimited(ip)) {
    const response: FeedbackResponse = {
      success: false,
      error: "Rate limit exceeded. Please try again later.",
    };

    return NextResponse.json(response, { status: 429 });
  }

  try {
    const payload = (await request.json()) as FeedbackPayload;

    if (typeof payload.title !== "string" || payload.title.trim().length === 0) {
      return badRequest("Title is required");
    }

    if (typeof payload.description !== "string" || payload.description.trim().length === 0) {
      return badRequest("Description is required");
    }

    if (payload.type !== "bug" && payload.type !== "feature" && payload.type !== "question") {
      return badRequest("Invalid feedback type");
    }

    const linearResponse = await fetch(LINEAR_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: linearApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: ISSUE_CREATE_MUTATION,
        variables: {
          input: {
            teamId: linearTeamId,
            title: payload.title.trim(),
            description: buildDescription(payload),
            priority: getPriority(payload.type),
          },
        },
      }),
    });

    if (!linearResponse.ok) {
      throw new Error(`Linear API request failed with status ${linearResponse.status}`);
    }

    const linearData = (await linearResponse.json()) as {
      data?: {
        issueCreate?: {
          success?: boolean;
          issue?: {
            id: string;
            identifier: string;
            url: string;
          };
        };
      };
      errors?: Array<{ message?: string }>;
    };

    if (linearData.errors && linearData.errors.length > 0) {
      const message = linearData.errors[0]?.message || "Failed to create issue";
      throw new Error(message);
    }

    const issueCreate = linearData.data?.issueCreate;
    const issue = issueCreate?.issue;

    if (!issueCreate?.success || !issue) {
      throw new Error("Failed to create issue");
    }

    const response: FeedbackResponse = {
      success: true,
      issueId: issue.identifier,
      issueUrl: issue.url,
    };

    return NextResponse.json(response);
  } catch {
    const response: FeedbackResponse = {
      success: false,
      error: "Failed to submit feedback",
    };

    return NextResponse.json(response, { status: 500 });
  }
}

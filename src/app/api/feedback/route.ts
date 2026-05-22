import { NextResponse } from "next/server";

import type { FeedbackPayload, FeedbackResponse } from "@/components/feedback/types";
import { auth } from "@/lib/auth";
import { getClientIp, isTrustProxyEnabled } from "@/lib/client-ip";
import { getServerEnv } from "@/lib/config";
import { ApiErrors, linearApiRequestFailedMessage } from "@/lib/constants/errors";
import { isRateLimited } from "@/lib/rate-limit";

const LINEAR_ENDPOINT = "https://api.linear.app/graphql";

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
  const origin = request.headers.get("origin");
  const env = getServerEnv();
  const nextAuthUrl = env.NEXTAUTH_URL;

  if (origin && nextAuthUrl) {
    try {
      const allowedOrigin = new URL(nextAuthUrl).origin;
      if (origin !== allowedOrigin) {
        return NextResponse.json(
          { success: false, error: "Forbidden" } satisfies FeedbackResponse,
          { status: 403 },
        );
      }
    } catch {}
  }

  const linearApiKey = env.LINEAR_API_KEY;
  const linearTeamId = env.LINEAR_TEAM_ID;

  if (!linearApiKey || !linearTeamId) {
    const response: FeedbackResponse = {
      success: false,
      error: "Feedback service not configured",
    };

    return NextResponse.json(response, { status: 503 });
  }

  const session = await auth();
  if (!session?.access_token) {
    return NextResponse.json(
      { success: false, error: "Authentication required" } satisfies FeedbackResponse,
      { status: 401 },
    );
  }

  const ip = getClientIp(request, { trustProxy: isTrustProxyEnabled(env.TRUST_PROXY) });
  const rateLimitKey = session.user?.id ?? ip;

  if (await isRateLimited(rateLimitKey)) {
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
      throw new Error(linearApiRequestFailedMessage(linearResponse.status));
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
      const message = linearData.errors[0]?.message || ApiErrors.FailedToCreateIssue;
      throw new Error(message);
    }

    const issueCreate = linearData.data?.issueCreate;
    const issue = issueCreate?.issue;

    if (!issueCreate?.success || !issue) {
      throw new Error(ApiErrors.FailedToCreateIssue);
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

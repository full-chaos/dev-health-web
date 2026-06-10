import { graphqlFetch } from "./urqlClient";
import { OPERATING_REVIEW_QUERY } from "./queries";
import type { OperatingReview, OperatingReviewInput, OperatingReviewQueryResponse } from "./types";

export async function getOperatingReviewViaGraphQL(
    orgId: string,
    input: OperatingReviewInput,
): Promise<OperatingReview> {
    const response = await graphqlFetch<OperatingReviewQueryResponse>(
        OPERATING_REVIEW_QUERY,
        { orgId, input },
        { orgId },
    );

    return response.operatingReview;
}

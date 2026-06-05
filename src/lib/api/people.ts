import type {
    PeopleSearchResult,
    PersonDrilldownResponse,
    PersonMetricResponse,
    PersonSummary,
} from "@/lib/types";
import { apiClient } from "@/lib/apiClient";

export async function searchPeople(query: string, limit = 20) {
    return apiClient.getJson<PeopleSearchResult[]>(
        "/api/v1/people",
        { q: query, limit },
        { cache: "no-store" },
    );
}

export async function getPersonSummary(params: {
    personId: string;
    range_days: number;
    compare_days: number;
}) {
    return apiClient.getJson<PersonSummary>(
        `/api/v1/people/${params.personId}/summary`,
        {
            range_days: params.range_days,
            compare_days: params.compare_days,
        },
        { cache: "no-store" },
    );
}

export async function getPersonMetric(params: {
    personId: string;
    metric: string;
    range_days: number;
    compare_days: number;
}) {
    return apiClient.getJson<PersonMetricResponse>(
        `/api/v1/people/${params.personId}/metric`,
        {
            metric: params.metric,
            range_days: params.range_days,
            compare_days: params.compare_days,
        },
        { cache: "no-store" },
    );
}

export async function getPersonDrilldown(params: {
    personId: string;
    type: "prs" | "issues";
    limit?: number;
    cursor?: string;
    metric?: string;
    range_days?: number;
    compare_days?: number;
}) {
    return apiClient.getJson<PersonDrilldownResponse>(
        `/api/v1/people/${params.personId}/drilldown/${params.type}`,
        {
            limit: params.limit ?? 50,
            cursor: params.cursor ?? "",
            metric: params.metric ?? "",
            range_days: params.range_days ?? "",
            compare_days: params.compare_days ?? "",
        },
        { cache: "no-store" },
    );
}

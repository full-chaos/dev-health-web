/**
 * GraphQL subscription hooks for real-time updates.
 */

import { useSubscription, type SubscriptionHandler } from "urql";

// Subscription queries
const METRICS_UPDATED_SUBSCRIPTION = `
  subscription MetricsUpdated($orgId: String!) {
    metricsUpdated(orgId: $orgId) {
      orgId
      day
      updatedAt
      message
    }
  }
`;

const TASK_STATUS_SUBSCRIPTION = `
  subscription TaskStatus($taskId: String!) {
    taskStatus(taskId: $taskId) {
      taskId
      status
      progress
      message
      result
      updatedAt
    }
  }
`;

export interface MetricsUpdate {
    orgId: string;
    day: string;
    updatedAt: string;
    message: string;
}

export interface TaskStatus {
    taskId: string;
    status: string;
    progress: number;
    message?: string;
    result?: string;
    updatedAt: string;
}

interface UseMetricsUpdatedOptions {
    orgId: string;
    onUpdate?: (data: MetricsUpdate) => void;
    pause?: boolean;
}

/**
 * Subscribe to metrics update notifications.
 */
export function useMetricsUpdated(options: UseMetricsUpdatedOptions) {
    const { orgId, onUpdate, pause = false } = options;

    const handleSubscription: SubscriptionHandler<
        { metricsUpdated: MetricsUpdate },
        MetricsUpdate | null
    > = (_, response) => {
        if (response.metricsUpdated && onUpdate) {
            onUpdate(response.metricsUpdated);
        }
        return response.metricsUpdated ?? null;
    };

    const [result] = useSubscription(
        {
            query: METRICS_UPDATED_SUBSCRIPTION,
            variables: { orgId },
            pause,
        },
        handleSubscription,
    );

    return {
        data: result.data,
        loading: result.fetching,
        error: result.error ?? null,
    };
}

interface UseTaskStatusOptions {
    taskId: string;
    onUpdate?: (data: TaskStatus) => void;
    pause?: boolean;
}

/**
 * Subscribe to task status updates.
 */
export function useTaskStatus(options: UseTaskStatusOptions) {
    const { taskId, onUpdate, pause = false } = options;

    const handleSubscription: SubscriptionHandler<{ taskStatus: TaskStatus }, TaskStatus | null> = (
        _,
        response,
    ) => {
        if (response.taskStatus && onUpdate) {
            onUpdate(response.taskStatus);
        }
        return response.taskStatus ?? null;
    };

    const [result] = useSubscription(
        {
            query: TASK_STATUS_SUBSCRIPTION,
            variables: { taskId },
            pause,
        },
        handleSubscription,
    );

    return {
        data: result.data,
        loading: result.fetching,
        error: result.error ?? null,
    };
}

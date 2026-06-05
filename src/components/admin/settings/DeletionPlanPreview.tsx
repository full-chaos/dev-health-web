import React from "react";
import type { DeletionPlan } from "@/lib/admin/types";

export type DeletionResult = DeletionPlan;

type DeletionPlanPreviewProps = {
    plan: DeletionResult;
    onConfirm: () => void;
    onCancel: () => void;
    isPending: boolean;
    confirmText: string;
    expectedConfirmText: string;
    setConfirmText: (text: string) => void;
};

export function DeletionPlanPreview({
    plan,
    onConfirm,
    onCancel,
    isPending,
    confirmText,
    expectedConfirmText,
    setConfirmText,
}: DeletionPlanPreviewProps) {
    const totalDeleted = Object.values(plan.deletedCounts).reduce((a, b) => a + b, 0);

    return (
        <div className="space-y-6">
            <div className="rounded-md bg-red-50 p-4 dark:bg-red-900/20">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                    Deletion Plan Preview
                </h3>
                <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                    <p>
                        The following data will be permanently deleted. This action cannot be
                        undone.
                    </p>
                </div>
            </div>

            <div className="overflow-hidden rounded-md border border-(--card-stroke)">
                <table className="min-w-full divide-y divide-(--card-stroke)">
                    <thead className="bg-(--card-70)">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-(--ink-muted) uppercase tracking-wider">
                                Category
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-(--ink-muted) uppercase tracking-wider">
                                Records to Delete
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-(--card-stroke) bg-(--background)">
                        {Object.entries(plan.deletedCounts).map(([category, count]) => (
                            <tr key={category}>
                                <td className="px-4 py-3 text-sm text-(--foreground) capitalize">
                                    {category.replace(/_/g, " ")}
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-(--foreground) font-mono">
                                    {count.toLocaleString()}
                                </td>
                            </tr>
                        ))}
                        {plan.disabledJobCount > 0 && (
                            <tr>
                                <td className="px-4 py-3 text-sm text-(--foreground)">
                                    Scheduled Jobs (Disabled)
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-(--foreground) font-mono">
                                    {plan.disabledJobCount.toLocaleString()}
                                </td>
                            </tr>
                        )}
                        {plan.credentialDeletionCount > 0 && (
                            <tr>
                                <td className="px-4 py-3 text-sm text-(--foreground)">
                                    Credentials
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-(--foreground) font-mono">
                                    {plan.credentialDeletionCount.toLocaleString()}
                                </td>
                            </tr>
                        )}
                        <tr className="bg-(--card-70) font-medium">
                            <td className="px-4 py-3 text-sm text-(--foreground)">Total Records</td>
                            <td className="px-4 py-3 text-sm text-right text-(--foreground) font-mono">
                                {totalDeleted.toLocaleString()}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {plan.warnings && plan.warnings.length > 0 && (
                <div className="rounded-md bg-yellow-50 p-4 dark:bg-yellow-900/20">
                    <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                        Warnings
                    </h3>
                    <ul className="mt-2 list-disc pl-5 text-sm text-yellow-700 dark:text-yellow-300">
                        {plan.warnings.map((warning, i) => (
                            <li key={i}>{warning}</li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="space-y-4 pt-4 border-t border-(--card-stroke)">
                <p className="text-sm text-(--foreground)">
                    Type <strong>{expectedConfirmText}</strong> to confirm deletion:
                </p>
                <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={expectedConfirmText}
                    disabled={isPending}
                    className="block w-full rounded-md border border-red-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-50"
                />
                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isPending}
                        className="rounded-md border border-(--card-stroke) px-4 py-2 text-sm font-medium text-(--foreground) hover:bg-(--card-70) disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={confirmText !== expectedConfirmText || isPending}
                        className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
                    >
                        {isPending ? "Deleting..." : "Delete Forever"}
                    </button>
                </div>
            </div>
        </div>
    );
}

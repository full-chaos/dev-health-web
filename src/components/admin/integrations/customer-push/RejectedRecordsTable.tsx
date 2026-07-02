import type { CustomerPushRejectedRecord } from "@/lib/admin/types";

type RejectedRecordsTableProps = {
    records: CustomerPushRejectedRecord[];
};

const COLUMNS = ["Index", "Kind", "External ID", "Code", "Path", "Message"];

export function RejectedRecordsTable({ records }: RejectedRecordsTableProps) {
    if (records.length === 0) {
        return (
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-6 text-center">
                <p className="text-sm text-green-600">No rejected records.</p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto rounded-xl border border-(--card-stroke) bg-(--card-80)">
            <table className="min-w-full divide-y divide-(--card-stroke)">
                <thead className="bg-(--card-bg)">
                    <tr>
                        {COLUMNS.map((heading) => (
                            <th
                                key={heading}
                                scope="col"
                                className="px-4 py-3 text-left text-xs font-medium text-(--ink-muted) uppercase tracking-wider"
                            >
                                {heading}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-(--card-stroke)">
                    {records.map((record, i) => (
                        <tr key={`${record.index}-${record.path ?? "no-path"}-${i}`}>
                            <td className="px-4 py-3 text-sm text-(--ink-muted)">{record.index}</td>
                            <td className="px-4 py-3 text-sm text-foreground">{record.kind}</td>
                            <td className="px-4 py-3 font-mono text-xs text-(--ink-muted)">
                                {record.external_id ?? "—"}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-(--ink-muted)">
                                {record.code}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-(--ink-muted)">
                                {record.path ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-sm text-red-500">{record.message}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

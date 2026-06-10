import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SettingsSection } from "@/components/admin/settings/SettingsSection";
import { listSettingCategories, listSettings } from "@/lib/admin/server";

export default async function SettingsPage() {
    const { data: categories, error: categoriesError } = await listSettingCategories();

    if (categoriesError) {
        return (
            <div>
                <AdminHeader
                    title="Platform Settings"
                    description="Global platform configuration."
                />
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-500">
                    Error loading settings: {categoriesError}
                </div>
            </div>
        );
    }

    const settingsPromises = (categories || []).map(async (category) => {
        const { data } = await listSettings(category);
        return { category, settings: data || [] };
    });

    const allSettings = await Promise.all(settingsPromises);

    return (
        <div>
            <AdminHeader title="Platform Settings" description="Global platform configuration." />

            <div className="space-y-8">
                {allSettings.map(({ category, settings }) => (
                    <SettingsSection
                        key={category}
                        title={category.charAt(0).toUpperCase() + category.slice(1)}
                        description={`Configuration for ${category} settings.`}
                    >
                        {settings.length === 0 ? (
                            <div className="text-sm text-(--ink-muted)">No settings found.</div>
                        ) : (
                            <div className="overflow-x-auto rounded-lg border border-(--border)">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-(--card-70) text-(--ink-muted)">
                                        <tr>
                                            <th className="px-4 py-3 font-medium">Key</th>
                                            <th className="px-4 py-3 font-medium">Value</th>
                                            <th className="px-4 py-3 font-medium">Description</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-(--border)">
                                        {settings.map((setting) => (
                                            <tr key={setting.key}>
                                                <td className="px-4 py-3 font-mono text-xs">
                                                    {setting.key}
                                                </td>
                                                <td className="px-4 py-3 font-mono text-xs text-(--ink-muted)">
                                                    {setting.is_encrypted
                                                        ? "********"
                                                        : setting.value}
                                                </td>
                                                <td className="px-4 py-3 text-(--ink-muted)">
                                                    {setting.description || "-"}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </SettingsSection>
                ))}

                <div className="rounded-2xl border border-dashed border-(--border) bg-(--card-70) p-6 text-center">
                    <p className="text-sm text-(--ink-muted)">
                        To edit these settings, please use the{" "}
                        <Link href="/admin/settings" className="text-(--accent) hover:underline">
                            Org Admin Settings
                        </Link>{" "}
                        page or the CLI.
                    </p>
                </div>
            </div>
        </div>
    );
}

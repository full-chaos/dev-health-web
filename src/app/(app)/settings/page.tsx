import { ChangePasswordSettings } from "@/components/settings/ChangePasswordSettings";
import { PreferencesSettings } from "@/components/settings/PreferencesSettings";
import { PageHeader } from "@/components/shell/PageHeader";

// Rendered inside the shared app shell (CHAOS-7966): the shell owns the navigation, the page
// padding and the `<main>` landmark; the trail ("Admin / Settings") replaces the in-page trail.
export default function UserPreferencesPage() {
    return (
        <div className="flex w-full flex-col gap-8" data-testid="settings-page">
            <PageHeader title="Settings" subtitle="Your display settings and your password." />

            <PreferencesSettings />

            <ChangePasswordSettings />
        </div>
    );
}

import { PreferencesSettings } from "@/components/settings/PreferencesSettings";
import { PageHeader } from "@/components/shell/PageHeader";

// Rendered inside the shared app shell (CHAOS-7966): the shell owns the navigation, the page
// padding and the `<main>` landmark; the trail ("Admin / Settings") replaces the in-page trail.
export default function UserPreferencesPage() {
    return (
        <div className="flex w-full max-w-3xl flex-col gap-8">
            <PageHeader
                title="Settings"
                subtitle="Personal display settings stored in your browser."
            />

            <PreferencesSettings />
        </div>
    );
}

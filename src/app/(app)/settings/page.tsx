import Link from "next/link";
import { PreferencesSettings } from "@/components/settings/PreferencesSettings";

export default function UserPreferencesPage() {
    return (
        <div className="mx-auto w-full max-w-3xl px-6 pb-20 pt-10">
            <div className="mb-8">
                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                    <Link href="/dashboard" className="hover:text-foreground transition-colors">
                        Dashboard
                    </Link>
                    {" / "}
                    Preferences
                </p>
                <h1 className="mt-3 font-(--font-display) text-2xl text-(--foreground)">
                    Preferences
                </h1>
                <p className="mt-2 text-sm text-(--ink-muted)">
                    Personal display settings stored in your browser.
                </p>
            </div>

            <PreferencesSettings />
        </div>
    );
}

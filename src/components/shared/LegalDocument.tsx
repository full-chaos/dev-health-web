type LegalSection = {
    title: string;
    paragraphs: string[];
    items?: string[];
};

type LegalDocumentProps = {
    eyebrow: string;
    title: string;
    summary: string;
    lastUpdated: string;
    sections: LegalSection[];
};

export function LegalDocument({
    eyebrow,
    title,
    summary,
    lastUpdated,
    sections,
}: LegalDocumentProps) {
    return (
        <section className="mx-auto max-w-4xl px-6 pb-24 pt-16 sm:pt-24">
            <div className="rounded-[2rem] border border-(--border) bg-(--card-80) p-8 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.45)] sm:p-12">
                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">{eyebrow}</p>
                <h1 className="mt-4 font-(--font-display) text-4xl leading-tight sm:text-5xl">
                    {title}
                </h1>
                <p className="mt-5 max-w-3xl text-base leading-7 text-(--ink-muted) sm:text-lg">
                    {summary}
                </p>
                <p className="mt-6 text-sm text-(--ink-muted)">Last updated: {lastUpdated}</p>

                <div className="mt-12 space-y-10">
                    {sections.map((section) => (
                        <section key={section.title} className="space-y-4">
                            <h2 className="font-(--font-display) text-2xl">{section.title}</h2>
                            {section.paragraphs.map((paragraph) => (
                                <p
                                    key={paragraph}
                                    className="text-sm leading-7 text-(--ink-muted) sm:text-base"
                                >
                                    {paragraph}
                                </p>
                            ))}
                            {section.items ? (
                                <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-(--ink-muted) sm:text-base">
                                    {section.items.map((item) => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            ) : null}
                        </section>
                    ))}
                </div>
            </div>
        </section>
    );
}

export type { LegalSection };

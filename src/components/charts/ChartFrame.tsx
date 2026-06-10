import type { ReactNode } from "react";

import { DataState, type DataStateVariant } from "@/components/ui/DataState";

type ChartFrameAnnotationTone = "default" | "positive" | "caution" | "negative" | "info";

type ChartFrameAnnotationDescriptor = {
    label: string;
    value?: ReactNode;
    tone?: ChartFrameAnnotationTone;
};

type ChartFrameAnnotation = ReactNode | ChartFrameAnnotationDescriptor;

export type ChartDirection = "up" | "down";

const directionLabel: Record<ChartDirection, string> = {
    up: "Higher is better",
    down: "Lower is better",
};

type ChartFrameProps = {
    title: ReactNode;
    interpretation: ReactNode;
    children: ReactNode;
    /**
     * Heading element for the title. Defaults to h3; pass "h2" when the frame
     * sits directly under a page h1 or beside sibling h2 cards so the document
     * outline doesn't skip a level.
     */
    headingLevel?: "h2" | "h3";
    direction?: ChartDirection;
    threshold?: ChartFrameAnnotation;
    band?: ChartFrameAnnotation;
    state?: DataStateVariant;
    isLoading?: boolean;
    isError?: boolean;
    isEmpty?: boolean;
    stateTitle?: string;
    stateDescription?: string;
    stateMessage?: string;
    stateAction?: ReactNode;
    className?: string;
    chartClassName?: string;
    "data-testid"?: string;
};

const annotationToneClassName: Record<ChartFrameAnnotationTone, string> = {
    default: "border-(--card-stroke) bg-(--card-80) text-(--ink-muted)",
    positive: "border-(--positive)/30 bg-(--positive)/10 text-(--positive)",
    caution: "border-(--caution)/30 bg-(--caution)/10 text-(--caution)",
    negative: "border-(--accent-negative)/30 bg-(--accent-negative)/10 text-(--accent-negative)",
    info: "border-(--info)/30 bg-(--info)/10 text-(--info)",
};

function isAnnotationDescriptor(
    annotation: ChartFrameAnnotation,
): annotation is ChartFrameAnnotationDescriptor {
    return (
        !!annotation &&
        typeof annotation === "object" &&
        !Array.isArray(annotation) &&
        "label" in annotation
    );
}

const annotationPresent = (annotation: ChartFrameAnnotation) =>
    annotation != null && annotation !== false;

function renderAnnotation(annotation: ChartFrameAnnotation, label: string) {
    if (!annotationPresent(annotation)) {
        return null;
    }

    if (!isAnnotationDescriptor(annotation)) {
        return <div className="text-sm text-(--ink-muted)">{annotation}</div>;
    }

    const tone = annotation.tone ?? "default";
    return (
        <div
            data-annotation={label}
            className={`inline-flex items-center gap-2 rounded-(--radius-pill) border px-3 py-1 text-xs font-medium ${annotationToneClassName[tone]}`}
        >
            <span>{annotation.label}</span>
            {annotation.value !== null &&
                annotation.value !== undefined &&
                annotation.value !== false && (
                    <span className="text-foreground">{annotation.value}</span>
                )}
        </div>
    );
}

function resolveDataState({
    state,
    isLoading,
    isError,
    isEmpty,
}: Pick<ChartFrameProps, "state" | "isLoading" | "isError" | "isEmpty">): DataStateVariant | null {
    if (state) return state;
    if (isLoading) return "loading";
    if (isError) return "error";
    if (isEmpty) return "preview-not-populated";
    return null;
}

export function ChartFrame({
    title,
    interpretation,
    children,
    headingLevel,
    direction,
    threshold,
    band,
    state,
    isLoading,
    isError,
    isEmpty,
    stateTitle,
    stateDescription,
    stateMessage,
    stateAction,
    className,
    chartClassName,
    "data-testid": testId,
}: ChartFrameProps) {
    const dataState = resolveDataState({ state, isLoading, isError, isEmpty });
    const hasAnnotations =
        direction != null || annotationPresent(threshold) || annotationPresent(band);
    const Heading = headingLevel ?? "h3";

    return (
        <section
            className={`rounded-(--radius-lg) border border-(--card-stroke) bg-(--card) p-5 shadow-(--elevation-card) ${className ?? ""}`.trim()}
            data-testid={testId}
        >
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                    <Heading className="font-(--font-display) text-base font-semibold text-foreground">
                        {title}
                    </Heading>
                    <div className="text-sm text-(--ink-muted)">{interpretation}</div>
                </div>
                {hasAnnotations && (
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        {direction != null &&
                            renderAnnotation(
                                { label: directionLabel[direction] },
                                "Chart direction",
                            )}
                        {renderAnnotation(threshold, "Chart threshold")}
                        {renderAnnotation(band, "Chart band")}
                    </div>
                )}
            </div>

            <div className={`mt-4 rounded-(--radius-md) ${chartClassName ?? ""}`.trim()}>
                {dataState ? (
                    <DataState
                        variant={dataState}
                        title={stateTitle}
                        description={stateDescription}
                        message={stateMessage}
                        action={stateAction}
                        className="min-h-64"
                    />
                ) : (
                    children
                )}
            </div>
        </section>
    );
}

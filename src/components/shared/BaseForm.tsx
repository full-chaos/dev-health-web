"use client";

import { useState, type ChangeEvent, type ReactNode, type SyntheticEvent } from "react";

export const inputClass =
  "w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)";

export function useBaseFormState<T>(initialState: T) {
  const [formData, setFormData] = useState<T>(initialState);

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type } = event.target;
    const nextValue = type === "checkbox" ? (event.target as HTMLInputElement).checked : value;
    setFormData((prev) => ({ ...prev, [name]: nextValue }));
  };

  return { formData, setFormData, handleChange };
}

type BaseFormProps = {
  onSubmitAction: (event: SyntheticEvent<HTMLFormElement>) => void;
  onCancelAction?: () => void;
  isLoading?: boolean;
  submitLabel: string;
  cancelLabel?: string;
  className?: string;
  contentClassName?: string;
  actionsClassName?: string;
  children: ReactNode;
  actionsStart?: ReactNode;
};

export function BaseForm({
  onSubmitAction,
  onCancelAction,
  isLoading = false,
  submitLabel,
  cancelLabel = "Cancel",
  className = "space-y-6",
  contentClassName = "space-y-4 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6",
  actionsClassName = "flex justify-end gap-3 pt-4",
  children,
  actionsStart,
}: BaseFormProps) {
  return (
    <form onSubmit={onSubmitAction} className={className}>
      <div className={contentClassName}>{children}</div>
      <div className={actionsClassName}>
        {actionsStart}
        {onCancelAction && (
          <button
            type="button"
            onClick={onCancelAction}
            disabled={isLoading}
            className="rounded-lg border border-(--card-stroke) px-4 py-2 text-sm font-medium text-(--ink-muted) hover:bg-(--card-70) hover:text-foreground disabled:opacity-50"
          >
            {cancelLabel}
          </button>
        )}
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

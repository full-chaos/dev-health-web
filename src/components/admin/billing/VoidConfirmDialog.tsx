"use client";

type VoidConfirmDialogProps = {
  isOpen: boolean;
  invoiceLabel: string;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function VoidConfirmDialog({
  isOpen,
  invoiceLabel,
  isPending,
  onCancel,
  onConfirm,
}: VoidConfirmDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl border border-(--card-stroke) bg-(--background) p-6 shadow-2xl">
        <h3 className="font-(--font-display) text-lg text-foreground">Void Invoice</h3>
        <p className="mt-2 text-sm text-(--ink-muted)">
          This will void <span className="font-medium text-foreground">{invoiceLabel}</span>. This
          action cannot be reversed.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-md border border-(--card-stroke) px-3 py-1.5 text-sm hover:bg-(--card-70) disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
          >
            {isPending ? "Voiding..." : "Confirm Void"}
          </button>
        </div>
      </div>
    </div>
  );
}

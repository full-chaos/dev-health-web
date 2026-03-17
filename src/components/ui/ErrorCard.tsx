import type { ReactNode } from "react";

interface ErrorCardProps {
  title: string;
  message?: string;
  action?: ReactNode;
}

export function ErrorCard({ title, message, action }: ErrorCardProps) {
  return (
    <div className="mx-auto max-w-md rounded-3xl border border-(--accent-negative)/30 bg-(--card-80) p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-(--accent-negative)/10 text-(--accent-negative)">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <h2 className="font-(--font-display) text-xl font-semibold">{title}</h2>
      {message && <p className="mt-2 text-sm text-(--ink-muted)">{message}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

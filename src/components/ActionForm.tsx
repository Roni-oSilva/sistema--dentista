"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/errors";

type Action = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

export function SubmitButton({ children, className = "btn", confirm }: { children: ReactNode; className?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? "Aguarde…" : children}
    </button>
  );
}

/** <form> ligado a uma Server Action, exibindo erro/sucesso. Sem JS de negócio: validação é no servidor. */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      {state && !state.ok && (
        <p role="alert" className="alert-error mt-3">
          {state.error}
        </p>
      )}
      {state && state.ok && state.message && (
        <p role="status" className="alert-ok mt-3">
          {state.message}
        </p>
      )}
    </form>
  );
}

export function Field({ label, name, error, children }: { label: string; name: string; error?: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <label htmlFor={name} className="label">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

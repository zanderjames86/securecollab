import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import type { ProviderState } from "../lib/hooks";
import { initials, personColor } from "../lib/share";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "whatsapp";

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`btn btn-${variant} ${className}`} {...props} />;
}

export function LinkButton({
  variant = "secondary",
  href,
  children,
  external,
}: {
  variant?: Variant;
  href: string;
  children: ReactNode;
  external?: boolean;
}) {
  return (
    <a
      className={`btn btn-${variant}`}
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

export function Field({
  label,
  hint,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null }) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="field-input"
        aria-describedby={note ? noteId : undefined}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {note && (
        <span id={noteId} className={error ? "field-error" : "field-hint"} role={error ? "alert" : undefined}>
          {note}
        </span>
      )}
    </div>
  );
}

export function Card({ title, actions, children }: { title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Avatar({ id, name, size = 32 }: { id: string; name: string; size?: number }) {
  return (
    <span
      className="avatar"
      title={name}
      style={{ background: personColor(id), width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(name)}
    </span>
  );
}

export function StatusPill({ state }: { state: ProviderState }) {
  let label: string;
  let tone: string;
  if (state.status === "offline") {
    label = state.unsaved > 0 ? `Offline · ${state.unsaved} unsaved` : "Offline";
    tone = "warn";
  } else if (state.status === "connecting" || !state.synced) {
    label = "Connecting…";
    tone = "muted";
  } else if (state.unsaved > 0) {
    label = "Saving…";
    tone = "muted";
  } else {
    label = "Saved · encrypted";
    tone = "ok";
  }
  return (
    <span className={`pill pill-${tone}`} role="status">
      <span className="pill-dot" />
      {label}
    </span>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger"; children: ReactNode }) {
  return <div className={`notice notice-${tone}`}>{children}</div>;
}

export function Lock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.4-3c-.3-.4.3-.4.7-1.3a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.7a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}

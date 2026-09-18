import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/** Centered card used by the login and signup screens. */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 text-3xl font-bold tracking-tight">
            <span className="text-accent">▲</span> Gamer Social
          </div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        <div className="rounded-xl border border-line bg-surface p-6 shadow-xl">
          {children}
        </div>
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm " +
        "text-ink placeholder:text-muted outline-none transition " +
        "focus:border-accent focus:ring-2 focus:ring-accent/30 " +
        "disabled:opacity-50 " +
        (props.className ?? "")
      }
    />
  );
}

export function Button({
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
}) {
  const base =
    "w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition " +
    "disabled:cursor-not-allowed disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "bg-accent text-white hover:bg-accent-hi active:scale-[0.99]"
      : "border border-line bg-transparent text-muted hover:text-ink hover:border-muted";

  return (
    <button {...props} className={`${base} ${styles} ${props.className ?? ""}`} />
  );
}

export function Alert({
  kind = "error",
  children,
}: {
  kind?: "error" | "ok";
  children: ReactNode;
}) {
  const styles =
    kind === "error"
      ? "border-danger/40 bg-danger/10 text-danger"
      : "border-ok/40 bg-ok/10 text-ok";

  return (
    <div className={`mb-4 rounded-lg border px-3 py-2.5 text-sm ${styles}`}>
      {children}
    </div>
  );
}

/** Shown while the app checks for a saved session on startup. */
export function FullScreenLoader() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
    </div>
  );
}

/** Composants communs : boutons, champs avec Coller, sorties avec Copier, notifications. */
import { useState, type ReactNode } from "react";
import { IconAlert, IconCheck, IconCopy, IconInfo, IconPaste } from "./Icons";

export function errText(err: unknown): string {
  return err instanceof Error ? err.message : "Erreur inconnue.";
}

const PALETTE = ["#0d9488", "#0f766e", "#14b8a6", "#0891b2", "#115e59", "#0e7490"];

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const hash = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return (
    <span className="avatar" style={{ width: size, height: size, background: PALETTE[hash % PALETTE.length], fontSize: size * 0.36 }}>
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

export function CopyButton({
  text,
  label,
  variant = "ghost",
  disabled,
  title,
}: {
  text: string;
  label?: string;
  variant?: "ghost" | "solid";
  disabled?: boolean;
  title?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`btn btn-sm ${variant === "solid" ? "btn-solid" : "btn-ghost"} ${done ? "is-done" : ""}`}
      disabled={disabled}
      title={title ?? "Copier dans le presse-papiers"}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        window.setTimeout(() => setDone(false), 1600);
      }}
    >
      {done ? <IconCheck size={15} /> : <IconCopy size={15} />}
      <span>{label ?? (done ? "Copié" : "Copier")}</span>
    </button>
  );
}

/** Zone de saisie avec bouton Coller à gauche. */
export function PasteField({
  value,
  onChange,
  placeholder,
  rows = 3,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  label?: string;
}) {
  return (
    <div className="field">
      {label && <span className="field-label">{label}</span>}
      <div className="input-group">
        <button
          type="button"
          className="btn btn-ghost input-side"
          title="Coller depuis le presse-papiers"
          onClick={async () => {
            try {
              onChange(await navigator.clipboard.readText());
            } catch {
              alert("Accès au presse-papiers refusé. Autorisez-le dans les réglages du navigateur.");
            }
          }}
        >
          <IconPaste size={16} />
          <span>Coller</span>
        </button>
        <textarea rows={rows} value={value} placeholder={placeholder} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

/** Résultat affiché avec son bouton Copier. */
export function Output({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="output">
      <div className="output-head">
        <span className="output-label">{label}</span>
        <div className="row-tight">
          {children}
          <CopyButton text={value} />
        </div>
      </div>
      <code>{value}</code>
    </div>
  );
}

export type NoticeKind = "ok" | "error" | "info";

export function Notice({ kind, text }: { kind: NoticeKind; text: string }) {
  const Icon = kind === "error" ? IconAlert : kind === "ok" ? IconCheck : IconInfo;
  return (
    <div className={`notice notice-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <Icon size={18} />
      <span>{text}</span>
    </div>
  );
}

export function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      <p className="muted">{text}</p>
    </div>
  );
}

/**
 * Sélecteur de destinataire : popover près du bouton (ordinateur),
 * feuille qui monte depuis le bas (mobile). Se ferme au clic extérieur et avec Échap.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConversationSummary } from "../lib/api";
import { Avatar, EmptyState, errText } from "./fields";
import { IconArrowRight, IconChat, IconSend, IconX } from "./Icons";
import { displayName } from "../lib/names";

interface Props {
  label: string;
  loadContacts: () => Promise<ConversationSummary[]>;
  onPick: (username: string) => void;
  onOpenChats: () => void;
}

export function RecipientPicker({ label, loadContacts, onPick, onOpenChats }: Props) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  async function toggle() {
    if (open) {
      close();
      return;
    }
    setOpen(true);
    setContacts(null);
    setError(null);
    try {
      setContacts(await loadContacts());
    } catch (err) {
      setError(errText(err));
      setContacts([]);
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: MouseEvent) => {
      if (!anchorRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, close]);

  return (
    <div className="picker-anchor" ref={anchorRef}>
      <button className="btn btn-solid btn-sm" onClick={toggle} aria-expanded={open}>
        <IconSend size={15} />
        <span>{label}</span>
      </button>

      {open && (
        <>
          <div className="picker-backdrop" onClick={close} aria-hidden="true" />
          <div className="picker-pop" role="dialog" aria-label="Choisir un destinataire">
            <div className="picker-head">
              <strong>Destinataire</strong>
              <button className="btn btn-ghost btn-icon btn-xs" onClick={close} aria-label="Fermer">
                <IconX size={14} />
              </button>
            </div>

            <div className="picker-body">
              {contacts === null && !error && (
                <p className="muted small picker-loading">
                  <span className="spinner" /> Chargement des discussions…
                </p>
              )}

              {error && <p className="notice notice-error">{error}</p>}

              {contacts !== null && contacts.length === 0 && !error && (
                <EmptyState
                  icon={<IconChat size={22} />}
                  title="Aucune discussion"
                  text="Ouvrez une discussion avec un contact pour pouvoir lui envoyer un texte encapsulé."
                />
              )}

              {contacts !== null && contacts.length > 0 && (
                <ul className="picker-list">
                  {contacts.map((c) => (
                    <li key={c.username}>
                      <button
                        className="picker-item"
                        onClick={() => {
                          close();
                          onPick(c.username);
                        }}
                      >
                        <Avatar name={c.username} size={30} />
                        <span>{c.username}</span>
                        <IconArrowRight size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {contacts !== null && contacts.length === 0 && (
              <button
                className="btn btn-solid btn-sm picker-cta"
                onClick={() => {
                  close();
                  onOpenChats();
                }}
              >
                Ouvrir les discussions
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

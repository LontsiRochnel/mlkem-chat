/**
 * Discussions : liste des contacts, fil de messages, texte encapsulé avec
 * décapsulation automatique, et envoi de messages en clair.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError, type ConversationSummary, type Message } from "../lib/api";
import { fromBase64, toBase64 } from "../lib/base64";
import { listPairs } from "../lib/keystore";
import { decaps } from "../lib/mlkem";
import { connectRealtime } from "../lib/socket";
import { Avatar, CopyButton, EmptyState, errText, formatWhen, Notice } from "./fields";
import { IconArrowRight, IconChat, IconLock, IconPlus, IconSend, IconUnlock, IconUser, IconX } from "./Icons";

export function ChatPanel({ username }: { username: string }) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [thread, setThread] = useState<Message[]>([]);
  const [contactKey, setContactKey] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [draft, setDraft] = useState("");
  const [opened, setOpened] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ name: string; hasKey: boolean } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Référence lue par le canal temps réel : évite de capturer une valeur périmée.
  const activeRef = useRef<string | null>(null);
  activeRef.current = active;

  const loadConversations = useCallback(async () => {
    setConversations(await api.conversations());
  }, []);

  const loadThread = useCallback(async (name: string) => {
    setThread(await api.thread(name));
  }, []);

  useEffect(() => {
    loadConversations().catch((err) => setError(errText(err)));
  }, [loadConversations]);

  useEffect(() => {
    if (!active) {
      setThread([]);
      setContactKey(null);
      return;
    }
    setError(null);
    loadThread(active).catch((err) => setError(errText(err)));
    api
      .publicKey(active)
      .then((info) => setContactKey(info.ek))
      .catch(() => setContactKey(null));
  }, [active, loadThread]);

  useEffect(() => {
    const socket = connectRealtime({
      onChange: () => {
        loadConversations().catch(() => undefined);
        const current = activeRef.current;
        if (current) loadThread(current).catch(() => undefined);
      },
      onKeyUpdate: (name) => {
        if (name !== activeRef.current) return;
        api
          .publicKey(name)
          .then((info) => setContactKey(info.ek))
          .catch(() => setContactKey(null));
      },
    });
    return () => {
      socket?.disconnect();
    };
  }, [loadConversations, loadThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length]);

  async function openNew(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim().toLowerCase();
    if (!name) return;
    setError(null);
    setPending(null);
    if (name === username) {
      setError("Vous ne pouvez pas vous écrire à vous-même.");
      return;
    }
    try {
      const user = await api.getUser(name);
      setPending({ name: user.username, hasKey: user.hasPublicKey });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? `Utilisateur « ${name} » introuvable.` : errText(err));
    }
  }

  function startChat() {
    if (!pending) return;
    setActive(pending.name);
    setPending(null);
    setShowNew(false);
    setNewName("");
  }

  const composerRef = useRef<HTMLTextAreaElement>(null);

  async function sendText(event?: { preventDefault(): void }) {
    event?.preventDefault();
    if (!active || !draft.trim()) return;
    setError(null);
    try {
      await api.send({ to: active, kind: "TEXT", body: draft.trim() });
      setDraft("");
      if (composerRef.current) composerRef.current.style.height = "auto";
      await Promise.all([loadThread(active), loadConversations()]);
    } catch (err) {
      setError(errText(err));
    }
  }

  /** Retrouve la clé privée locale grâce à l'empreinte transportée par le message, puis décapsule. */
  async function decapAuto(message: Message) {
    setError(null);
    try {
      const pairs = await listPairs(username);
      const pair = pairs.find((p) => p.fingerprint === message.ekFingerprint);
      if (!pair || !message.variant || pair.variant !== message.variant) {
        setError("Clé de déchiffrement absente sur cet appareil : ce message ne peut pas être ouvert ici.");
        return;
      }
      const K = decaps(fromBase64(pair.dk), fromBase64(message.body), pair.variant);
      setOpened((prev) => ({ ...prev, [message.id]: toBase64(K) }));
    } catch (err) {
      setError(errText(err));
    }
  }

  return (
    <div className="chat">
      <aside className="card chat-list">
        <div className="chat-list-head">
          <h2>Discussions</h2>
          <button className="btn btn-solid btn-icon" onClick={() => setShowNew((v) => !v)} aria-label="Nouvelle discussion" title="Nouvelle discussion">
            {showNew ? <IconX size={18} /> : <IconPlus size={18} />}
          </button>
        </div>

        {showNew && (
          <form className="new-chat" onSubmit={openNew}>
            <div className="input-with-icon">
              <IconUser size={16} />
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nom du destinataire" autoFocus />
            </div>
            <button className="btn btn-solid btn-icon" type="submit" aria-label="Ouvrir la discussion">
              <IconArrowRight size={16} />
            </button>
          </form>
        )}

        {showNew && pending && (
          <button className="confirm-chat" onClick={startChat} aria-label={`Discuter avec ${pending.name}`} title={`Discuter avec ${pending.name}`}>
            <Avatar name={pending.name} size={38} />
            <span className="confirm-text">
              <strong>{pending.name}</strong>
              <small>{pending.hasKey ? "Clé publique disponible" : "Aucune clé publiée"}</small>
            </span>
            <span className="confirm-go">
              <IconChat size={18} />
            </span>
          </button>
        )}

        {conversations.length === 0 ? (
          <EmptyState icon={<IconChat size={24} />} title="Aucune discussion" text="Cliquez sur + pour écrire à quelqu'un." />
        ) : (
          <ul className="contacts">
            {conversations.map((c) => (
              <li key={c.username}>
                <button className={`contact ${c.username === active ? "is-active" : ""}`} onClick={() => setActive(c.username)}>
                  <Avatar name={c.username} size={38} />
                  <span className="contact-text">
                    <strong>{c.username}</strong>
                    <small>
                      {c.lastMessageKind === "KEM_CIPHERTEXT" && <IconLock size={12} />}
                      {c.lastMessageKind === "KEM_CIPHERTEXT" ? "Texte encapsulé" : "Message"}
                    </small>
                  </span>
                  <time>{formatWhen(c.lastMessageAt)}</time>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="card chat-main">
        {!active ? (
          <EmptyState icon={<IconChat size={28} />} title="Vos messages" text="Sélectionnez une discussion, ou démarrez-en une avec le bouton +." />
        ) : (
          <>
            <header className="chat-head">
              <div className="chat-identity">
                <Avatar name={active} size={42} />
                <div>
                  <strong>{active}</strong>
                  <small className={contactKey ? "online" : "offline"}>{contactKey ? "Clé publique disponible" : "Aucune clé publiée"}</small>
                </div>
              </div>
              {contactKey ? (
                <CopyButton text={contactKey} label="Copier PK" variant="solid" title="Copier la clé publique du contact" />
              ) : (
                <button className="btn btn-ghost btn-sm" disabled title="Ce contact n'a publié aucune clé">
                  Copier PK
                </button>
              )}
            </header>

            {error && <Notice kind="error" text={error} />}

            <div className="thread">
              {thread.length === 0 && <p className="muted center small">Aucun message. Dites bonjour.</p>}
              {thread.map((m) => {
                const mine = m.from === username;
                return (
                  <div key={m.id} className={`bubble-row ${mine ? "is-mine" : ""}`}>
                    <div className={`bubble ${mine ? "bubble-mine" : "bubble-other"}`}>
                      {m.kind === "TEXT" ? (
                        <p className="bubble-text">{m.body}</p>
                      ) : (
                        <div className="kem">
                          <div className="kem-title">
                            <IconLock size={15} />
                            <span>Voici mon texte encapsulé :</span>
                          </div>
                          <code className="kem-ct">{m.body}</code>
                          <div className="kem-actions">
                            <CopyButton text={m.body} />
                            {!mine && (
                              <button className="btn btn-solid btn-sm" onClick={() => decapAuto(m)}>
                                <IconUnlock size={15} />
                                <span>Décap auto</span>
                              </button>
                            )}
                          </div>
                          {opened[m.id] && (
                            <div className="kem-k">
                              <span className="kem-k-label">Secret K</span>
                              <code>{opened[m.id]}</code>
                              <CopyButton text={opened[m.id]} />
                            </div>
                          )}
                        </div>
                      )}
                      <time>{formatWhen(m.createdAt)}</time>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <form className="composer" onSubmit={sendText}>
              <textarea
                ref={composerRef}
                className="composer-input"
                rows={1}
                value={draft}
                placeholder="Écrire un message"
                maxLength={2000}
                onChange={(e) => {
                  setDraft(e.target.value);
                  e.currentTarget.style.height = "auto";
                  e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendText();
                  }
                }}
              />
              <button className="btn btn-solid btn-send" type="submit" disabled={!draft.trim()} aria-label="Envoyer">
                <IconSend size={18} />
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

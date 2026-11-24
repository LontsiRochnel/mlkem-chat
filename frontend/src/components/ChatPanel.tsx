/**
 * Discussions : deux modes par conversation (clair ou sécurisé), saisie de la clé
 * secrète, déchiffrement, redéchiffrement et envoi chiffré.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError, type ConversationSummary, type Message } from "../lib/api";
import { fromBase64, toBase64 } from "../lib/base64";
import { copyLater } from "../lib/clipboard";
import { decryptText, encryptText, secretFingerprint } from "../lib/crypto";
import { saveClear, getClearMap, getConversation, saveConversation, emptyConversation, listPairs, type ConversationSettings } from "../lib/keystore";
import { decaps } from "../lib/mlkem";
import { connectRealtime } from "../lib/socket";
import { Avatar, CopyButton, EmptyState, errText, formatWhen, Notice, PasteField } from "./fields";
import { IconArrowRight, IconChat, IconCheck, IconCopy, IconKey, IconLock, IconPlus, IconRefresh, IconSend, IconUnlock, IconUser, IconX } from "./Icons";
import { displayName } from "../lib/names";

/** Accepte une clé en base64 (44 caractères) ou en hexadécimal (64 caractères) : 32 octets dans les deux cas. */
function parseKey(raw: string): Uint8Array {
  const value = raw.trim();
  let bytes: Uint8Array | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    bytes = Uint8Array.from(value.match(/../g) ?? [], (h) => parseInt(h, 16));
  } else {
    try {
      bytes = fromBase64(value);
    } catch {
      bytes = null;
    }
  }
  if (!bytes || bytes.length !== 32) {
    throw new Error("Clé invalide : 32 octets attendus, en base64 (44 caractères) ou en hexadécimal (64 caractères).");
  }
  return bytes;
}

export function ChatPanel({ username }: { username: string }) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [thread, setThread] = useState<Message[]>([]);
  const [contactKey, setContactKey] = useState<string | null>(null);
  const [settings, setSettings] = useState<ConversationSettings | null>(null);
  const [clear, setClear] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [sendingText, setSendingText] = useState<string | null>(null);
  const [keyPanel, setKeyPanel] = useState<"new" | "edit" | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [pending, setPending] = useState<{ name: string; hasKey: boolean } | null>(null);
  const [draft, setDraft] = useState("");
  const [opened, setOpened] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pkCopied, setPkCopied] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const activeRef = useRef<string | null>(null);
  activeRef.current = active;
  const attemptedRef = useRef<Set<string>>(new Set());

  const isSecure = settings?.mode === "secure";

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
    getClearMap(username)
      .then(setClear)
      .catch(() => undefined);
  }, [username]);

  useEffect(() => {
    setKeyPanel(null);
    setError(null);
    attemptedRef.current = new Set();
    if (!active) {
      setThread([]);
      setContactKey(null);
      setSettings(null);
      return;
    }
    loadThread(active).catch((err) => setError(errText(err)));
    api
      .publicKey(active)
      .then((info) => setContactKey(info.ek))
      .catch(() => setContactKey(null));
    getConversation(username, active)
      .then((found) => setSettings(found ?? emptyConversation(username, active)))
      .catch(() => setSettings(emptyConversation(username, active)));
  }, [active, loadThread, username]);

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
  }, [thread.length, sendingText]);

  /** Déchiffre un message avec la clé donnée. Renvoie false si la clé ne correspond pas. */
  const decryptMessage = useCallback(
    async (m: Message, keyB64: string): Promise<boolean> => {
      setBusy((b) => ({ ...b, [m.id]: true }));
      try {
        const plaintext = await decryptText(fromBase64(keyB64), m.from, m.to, m.iv ?? "", m.body);
        await saveClear(username, m.id, plaintext);
        setClear((c) => ({ ...c, [m.id]: plaintext }));
        return true;
      } catch {
        return false;
      } finally {
        setBusy((b) => ({ ...b, [m.id]: false }));
      }
    },
    [username],
  );

  /** Tente de déchiffrer tous les messages verrouillés avec une clé (passage en Sécurisé, changement de clé). */
  async function unlockLocked(keyB64: string): Promise<void> {
    const locked = thread.filter((m) => m.kind === "SECURE_TEXT" && clear[m.id] === undefined);
    if (locked.length === 0) return;
    let unlocked = 0;
    for (const m of locked) {
      if (await decryptMessage(m, keyB64)) unlocked += 1;
    }
    if (unlocked === 0) {
      setError("Aucun message verrouillé ne correspond à cette clé.");
    }
  }

  // Arrivée de nouveaux messages chiffrés : déchiffrement automatique si la clé de la discussion les concerne.
  useEffect(() => {
    if (!isSecure || !settings?.key || !settings.keyFingerprint) return;
    for (const m of thread) {
      if (m.kind !== "SECURE_TEXT" || clear[m.id] !== undefined) continue;
      if (m.keyFingerprint !== settings.keyFingerprint) continue;
      const tag = `${m.id}|${m.keyFingerprint}`;
      if (attemptedRef.current.has(tag)) continue;
      attemptedRef.current.add(tag);
      void decryptMessage(m, settings.key);
    }
  }, [isSecure, settings, thread, clear, decryptMessage]);

  async function refreshAfterSend(name: string) {
    await Promise.all([loadThread(name), loadConversations()]);
  }

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

  async function copyPk() {
    if (!active) return;
    setError(null);
    try {
      await copyLater(() =>
        api.publicKey(active).then((info) => {
          setContactKey(info.ek);
          return info.ek;
        }),
      );
      setPkCopied(true);
      window.setTimeout(() => setPkCopied(false), 1600);
    } catch (err) {
      setContactKey(null);
      setError(err instanceof ApiError && err.status === 404 ? `${active} n'a publié aucune clé publique.` : errText(err));
    }
  }

  /** Change le mode. Passer en Sécurisé sans clé ouvre la saisie de clé. */
  async function setMode(mode: "plain" | "secure") {
    if (!active || !settings) return;
    setError(null);
    if (mode === "secure" && !settings.key) {
      setKeyPanel("new");
      return;
    }
    const next: ConversationSettings = { ...settings, mode, updatedAt: new Date().toISOString() };
    await saveConversation(next);
    setSettings(next);
    setKeyPanel(null);
    if (mode === "secure" && next.key) await unlockLocked(next.key);
  }

  /** Enregistre une nouvelle clé pour la discussion. */
  async function saveKey(raw: string, enableSecure: boolean): Promise<string> {
    if (!active || !settings) throw new Error("Aucune discussion ouverte.");
    const secret = parseKey(raw);
    const next: ConversationSettings = {
      ...settings,
      mode: enableSecure ? "secure" : settings.mode,
      key: toBase64(secret),
      keyFingerprint: await secretFingerprint(secret),
      updatedAt: new Date().toISOString(),
    };
    await saveConversation(next);
    setSettings(next);
    setKeyPanel(null);
    setKeyDraft("");
    return next.key ?? "";
  }

  async function submitKey() {
    setError(null);
    try {
      const enable = keyPanel === "new";
      const key = await saveKey(keyDraft, enable);
      if (enable) await unlockLocked(key);
    } catch (err) {
      setError(errText(err));
    }
  }

  /** Utilise un K obtenu par décapsulation comme clé de la discussion, et passe en Sécurisé. */
  async function useAsKey(kB64: string) {
    if (!active || !settings) return;
    setError(null);
    try {
      const secret = fromBase64(kB64);
      const next: ConversationSettings = {
        ...settings,
        mode: "secure",
        key: kB64,
        keyFingerprint: await secretFingerprint(secret),
        updatedAt: new Date().toISOString(),
      };
      await saveConversation(next);
      setSettings(next);
      await unlockLocked(kB64);
    } catch (err) {
      setError(errText(err));
    }
  }

  /** Redéchiffre un message verrouillé avec la clé courante. */
  async function retryOne(m: Message) {
    if (!settings?.key) return;
    setError(null);
    const ok = await decryptMessage(m, settings.key);
    if (!ok) setError("Cette clé ne déchiffre pas ce message.");
  }

  async function retryAll() {
    if (!settings?.key) return;
    setError(null);
    await unlockLocked(settings.key);
  }

  async function sendText(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!active || !text || sendingText !== null) return;
    setError(null);

    if (!isSecure) {
      setDraft("");
      try {
        await api.send({ to: active, kind: "TEXT", body: text });
        await refreshAfterSend(active);
      } catch (err) {
        setDraft(text);
        setError(errText(err));
      }
      return;
    }

    if (!settings?.key || !settings.keyFingerprint) {
      setError("Saisissez une clé avant d'envoyer en mode sécurisé.");
      return;
    }
    setSendingText(text);
    setDraft("");
    try {
      const sealed = await encryptText(fromBase64(settings.key), username, active, text);
      const sent = await api.send({
        to: active,
        kind: "SECURE_TEXT",
        body: sealed.body,
        iv: sealed.iv,
        keyFingerprint: settings.keyFingerprint,
      });
      await saveClear(username, sent.id, text);
      setClear((c) => ({ ...c, [sent.id]: text }));
      await refreshAfterSend(active);
    } catch (err) {
      setDraft(text);
      setError(errText(err));
    } finally {
      setSendingText(null);
    }
  }

  /** Déchiffrement d'un KEM_CIPHERTEXT : retrouve la clé privée locale grâce à l'empreinte de ek. */
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

  /** Bulle d'un message chiffré non déchiffré : explique pourquoi et propose de réessayer. */
  function renderLocked(m: Message) {
    const running = !!busy[m.id];
    let reason: string;
    if (!isSecure) reason = "Passez en mode Sécurisé pour lire ce message.";
    else if (!settings?.key) reason = "Aucune clé dans cette discussion.";
    else reason = "Cette clé ne déchiffre pas ce message.";
    const canRetry = isSecure && !!settings?.key && !running;
    return (
      <div className="locked">
        <span className="locked-icon">{running ? <span className="spinner" aria-label="Déchiffrement en cours" /> : <IconLock size={16} />}</span>
        <span className="locked-text">{running ? "Déchiffrement en cours…" : reason}</span>
        {canRetry && (
          <button className="btn btn-ghost btn-icon btn-xs" title="Redéchiffrer avec la clé actuelle" onClick={() => retryOne(m)}>
            <IconRefresh size={14} />
          </button>
        )}
      </div>
    );
  }

  const hasKey = !!settings?.key;

  return (
    <div className={`chat ${isSecure ? "is-secure" : ""}`}>
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
            <button className="btn btn-solid btn-icon" type="submit" aria-label="Rechercher">
              <IconArrowRight size={16} />
            </button>
          </form>
        )}

        {showNew && pending && (
          <button className="confirm-chat" onClick={startChat} aria-label={`Discuter avec ${pending.name}`} title={`Discuter avec ${pending.name}`}>
            <Avatar name={pending.name} size={38} />
            <span className="confirm-text">
              <strong>{displayName(pending.name)}</strong>
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
                    <strong>{displayName(c.username)}</strong>
                    <small>
                      {c.lastMessageKind === "KEM_CIPHERTEXT" && <IconLock size={12} />}
                      {c.lastMessageKind === "SECURE_TEXT" && <IconLock size={12} />}
                      {c.lastMessageKind === "KEM_CIPHERTEXT" ? "Texte encapsulé" : c.lastMessageKind === "SECURE_TEXT" ? "Message chiffré" : "Message"}
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
                  <strong>{displayName(active)}</strong>
                  <small className={contactKey ? "online" : "offline"}>
                    {contactKey ? "Clé publique disponible" : "Aucune clé publiée"}
                    {hasKey && settings?.keyFingerprint && <span className="fp"> · clé {settings.keyFingerprint.slice(0, 8)}</span>}
                  </small>
                </div>
              </div>

              <div className="chat-tools">
                <div className="mode-switch" role="group" aria-label="Mode de la discussion">
                  <button className={!isSecure ? "is-active" : ""} onClick={() => setMode("plain")}>
                    <IconUnlock size={14} />
                    <span>Non sécurisé</span>
                  </button>
                  <button className={isSecure ? "is-active" : ""} onClick={() => setMode("secure")}>
                    <IconLock size={14} />
                    <span>Sécurisé</span>
                  </button>
                </div>

                {hasKey && (
                  <button className="btn btn-ghost btn-icon" title="Changer de clé" onClick={() => setKeyPanel("edit")}>
                    <IconKey size={16} />
                  </button>
                )}
                {isSecure && hasKey && (
                  <button className="btn btn-ghost btn-icon" title="Redéchiffrer les messages verrouillés" onClick={retryAll}>
                    <IconRefresh size={16} />
                  </button>
                )}

                {contactKey ? (
                  <button
                    className={`btn btn-sm btn-solid ${pkCopied ? "is-done" : ""}`}
                    onClick={copyPk}
                    title="Copier la dernière clé publique de ce contact"
                  >
                    {pkCopied ? <IconCheck size={15} /> : <IconCopy size={15} />}
                    <span>{pkCopied ? "Copié" : "Copier PK"}</span>
                  </button>
                ) : (
                  <button className="btn btn-ghost btn-sm" disabled title="Ce contact n'a publié aucune clé">
                    <IconCopy size={15} />
                    <span>Copier PK</span>
                  </button>
                )}
              </div>
            </header>

            {keyPanel && (
              <div className="key-panel">
                <div className="key-panel-head">
                  <IconKey size={16} />
                  <strong>{keyPanel === "new" ? "Clé secrète de la discussion" : "Changer de clé"}</strong>
                </div>
                <PasteField value={keyDraft} onChange={setKeyDraft} placeholder="Clé en base64 (44 caractères) ou hexadécimal (64 caractères)" rows={2} />
                <div className="row-end">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setKeyPanel(null);
                      setKeyDraft("");
                    }}
                  >
                    Annuler
                  </button>
                  <button className="btn btn-solid btn-sm" disabled={!keyDraft.trim()} onClick={submitKey}>
                    {keyPanel === "new" ? "Enregistrer et passer en Sécurisé" : "Enregistrer la clé"}
                  </button>
                </div>
              </div>
            )}

            {error && <Notice kind="error" text={error} />}

            <div className="thread">
              {thread.length === 0 && sendingText === null && <p className="muted center small">Aucun message. Dites bonjour.</p>}

              {thread.map((m) => {
                const mine = m.from === username;
                return (
                  <div key={m.id} className={`bubble-row ${mine ? "is-mine" : ""}`}>
                    <div className={`bubble ${mine ? "bubble-mine" : "bubble-other"}`}>
                      {m.kind === "TEXT" && <p className="bubble-text">{m.body}</p>}

                      {m.kind === "KEM_CIPHERTEXT" && (
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
                              <button className="btn btn-solid btn-sm" onClick={() => useAsKey(opened[m.id])}>
                                <IconKey size={15} />
                                <span>Utiliser cette clé</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {m.kind === "SECURE_TEXT" && (clear[m.id] !== undefined ? <p className="bubble-text">{clear[m.id]}</p> : renderLocked(m))}

                      <div className="bubble-foot">
                        {m.kind === "SECURE_TEXT" && clear[m.id] !== undefined && <IconLock size={11} className="foot-lock" aria-label="Message chiffré" />}
                        <time>{formatWhen(m.createdAt)}</time>
                      </div>
                    </div>
                  </div>
                );
              })}

              {sendingText !== null && (
                <div className="bubble-row is-mine">
                  <div className="bubble bubble-mine bubble-pending">
                    <p className="bubble-text">{sendingText}</p>
                    <span className="pending-state">
                      <span className="spinner" />
                      <span>Chiffrement et envoi…</span>
                    </span>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            <form className="composer" onSubmit={sendText}>
              <textarea
                ref={composerRef}
                className="composer-input"
                rows={1}
                value={draft}
                placeholder={isSecure ? "Message chiffré" : "Écrire un message"}
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
              <button className="btn btn-solid btn-icon btn-send" type="submit" disabled={!draft.trim() || sendingText !== null} aria-label="Envoyer">
                {sendingText !== null ? <span className="spinner" /> : <IconSend size={18} />}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

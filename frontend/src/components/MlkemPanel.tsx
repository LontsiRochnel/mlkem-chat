/**
 * Section ML-KEM : un sélecteur d'action (générer, encapsuler, décapsuler), puis
 * le panneau correspondant. Toutes les opérations se font dans le navigateur.
 */
import { useEffect, useState } from "react";
import { api, type ConversationSummary } from "../lib/api";
import { fromBase64, toBase64 } from "../lib/base64";
import { deletePair, listPairs, savePair, type StoredPair } from "../lib/keystore";
import { CT_SIZES, VARIANTS, decaps, encaps, fingerprint, keygen, variantFromEkLength, type Variant } from "../lib/mlkem";
import { Avatar, CopyButton, EmptyState, errText, formatWhen, Notice, Output, PasteField, type NoticeKind } from "./fields";
import { IconArrowRight, IconChat, IconEye, IconEyeOff, IconKey, IconLock, IconSend, IconSpark, IconTrash, IconUnlock, IconX } from "./Icons";

type Action = "generate" | "encapsulate" | "decapsulate";
type Status = { kind: NoticeKind; text: string } | null;

const ACTIONS: { id: Action; title: string; hint: string; icon: typeof IconKey }[] = [
  { id: "generate", title: "Générer", hint: "Créer une paire de clés et publier la clé publique", icon: IconKey },
  { id: "encapsulate", title: "Encapsuler", hint: "Produire un secret pour un destinataire", icon: IconLock },
  { id: "decapsulate", title: "Décapsuler", hint: "Retrouver le secret à partir d'un texte reçu", icon: IconUnlock },
];

export function MlkemPanel({ username }: { username: string }) {
  const [action, setAction] = useState<Action>("generate");
  const [status, setStatus] = useState<Status>(null);

  function select(next: Action) {
    setAction(next);
    setStatus(null);
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Chiffrement ML-KEM</h1>
          <p className="muted">Les calculs s'exécutent dans votre navigateur. Vos clés privées ne quittent jamais cet appareil.</p>
        </div>
      </header>

      <div className="action-bar" role="tablist" aria-label="Action ML-KEM">
        {ACTIONS.map((a) => {
          const Icon = a.icon;
          const selected = action === a.id;
          return (
            <button key={a.id} role="tab" aria-selected={selected} className={`action-card ${selected ? "is-selected" : ""}`} onClick={() => select(a.id)}>
              <span className="action-icon">
                <Icon size={20} />
              </span>
              <span className="action-text">
                <strong>{a.title}</strong>
                <small>{a.hint}</small>
              </span>
            </button>
          );
        })}
      </div>

      {status && <Notice kind={status.kind} text={status.text} />}

      <section className="card panel" role="tabpanel">
        {action === "generate" && <GeneratePanel username={username} onStatus={setStatus} />}
        {action === "encapsulate" && <EncapsulatePanel onStatus={setStatus} />}
        {action === "decapsulate" && <DecapsulatePanel username={username} onStatus={setStatus} />}
      </section>
    </div>
  );
}

/* ---------- Générer ---------- */

function GeneratePanel({ username, onStatus }: { username: string; onStatus: (s: Status) => void }) {
  const [variant, setVariant] = useState<Variant>("ML-KEM-768");
  const [pairs, setPairs] = useState<StoredPair[]>([]);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const refresh = () => listPairs(username).then(setPairs);
  useEffect(() => {
    void refresh();
  }, [username]);

  async function generate() {
    setBusy(true);
    onStatus(null);
    try {
      const kp = keygen(variant);
      const stored: StoredPair = {
        id: crypto.randomUUID(),
        username,
        variant,
        ek: toBase64(kp.ek),
        dk: toBase64(kp.dk),
        fingerprint: fingerprint(kp.ek),
        createdAt: new Date().toISOString(),
      };
      await savePair(stored);
      await api.publishKey(variant, stored.ek);
      onStatus({ kind: "ok", text: "Paire générée. La clé publique est publiée sur le serveur." });
      await refresh();
    } catch (err) {
      onStatus({ kind: "error", text: errText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: StoredPair) {
    const ok = window.confirm(
      `Supprimer la paire ${p.variant} (${p.fingerprint}) de ce navigateur ?\n` + "Les messages chiffrés avec cette clé ne pourront plus être ouverts ici.",
    );
    if (!ok) return;
    await deletePair(p.id);
    setRevealed((r) => {
      const next = { ...r };
      delete next[p.id];
      return next;
    });
    await refresh();
  }

  return (
    <div className="stack-lg">
      <div className="toolbar">
        <div className="segmented" role="radiogroup" aria-label="Variante">
          {VARIANTS.map((v) => (
            <button key={v} role="radio" aria-checked={variant === v} className={variant === v ? "is-active" : ""} onClick={() => setVariant(v)}>
              {v.replace("ML-KEM-", "")}
            </button>
          ))}
        </div>
        <button className="btn btn-solid" onClick={generate} disabled={busy}>
          <IconSpark size={16} />
          <span>{busy ? "Génération…" : "Générer une paire"}</span>
        </button>
      </div>

      <div>
        <h2 className="section-title">Mes paires locales</h2>
        {pairs.length === 0 ? (
          <EmptyState icon={<IconKey size={26} />} title="Aucune paire" text="Générez une paire pour recevoir des messages." />
        ) : (
          <ul className="pair-list">
            {pairs.map((p) => (
              <li key={p.id} className="pair">
                <div className="pair-main">
                  <span className="badge">{p.variant}</span>
                  <code className="mono">{p.fingerprint}</code>
                  <span className="muted small">{formatWhen(p.createdAt)}</span>
                </div>
                <div className="row-tight">
                  <CopyButton text={p.ek} label="Clé publique" />
                  <button className="btn btn-ghost btn-sm" onClick={() => setRevealed((r) => ({ ...r, [p.id]: !r[p.id] }))}>
                    {revealed[p.id] ? <IconEyeOff size={15} /> : <IconEye size={15} />}
                    <span>{revealed[p.id] ? "Masquer" : "Clé privée"}</span>
                  </button>
                  <button className="btn btn-ghost btn-sm btn-danger" onClick={() => remove(p)} title="Supprimer cette paire">
                    <IconTrash size={15} />
                    <span>Supprimer</span>
                  </button>
                </div>
                {revealed[p.id] && (
                  <div className="secret-row">
                    <Output label="Clé privée (dk), locale uniquement" value={p.dk} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------- Encapsuler ---------- */

interface EncapResult {
  K: string;
  c: string;
  fingerprint: string;
  variant: Variant;
}

function EncapsulatePanel({ onStatus }: { onStatus: (s: Status) => void }) {
  const [ekInput, setEkInput] = useState("");
  const [result, setResult] = useState<EncapResult | null>(null);
  const [picker, setPicker] = useState(false);
  const [contacts, setContacts] = useState<ConversationSummary[]>([]);

  function encapsulate() {
    onStatus(null);
    setPicker(false);
    try {
      let ek: Uint8Array;
      try {
        ek = fromBase64(ekInput.trim());
      } catch {
        throw new Error("Clé publique invalide : base64 attendu.");
      }
      const variant = variantFromEkLength(ek.length);
      if (!variant) throw new Error("Taille de clé publique non reconnue.");
      const { K, c } = encaps(ek, variant);
      setResult({ K: toBase64(K), c: toBase64(c), fingerprint: fingerprint(ek), variant });
      onStatus({ kind: "ok", text: "Encapsulation réussie. Transmettez le texte encapsulé au destinataire." });
    } catch (err) {
      onStatus({ kind: "error", text: errText(err) });
    }
  }

  async function openPicker() {
    try {
      setContacts(await api.conversations());
      setPicker(true);
    } catch (err) {
      onStatus({ kind: "error", text: errText(err) });
    }
  }

  async function sendTo(to: string) {
    if (!result) return;
    try {
      await api.send({
        to,
        kind: "KEM_CIPHERTEXT",
        body: result.c,
        variant: result.variant,
        ekFingerprint: result.fingerprint,
      });
      setPicker(false);
      onStatus({ kind: "ok", text: `Texte encapsulé envoyé à ${to}.` });
    } catch (err) {
      onStatus({ kind: "error", text: errText(err) });
    }
  }

  return (
    <div className="stack-lg">
      <PasteField label="Clé publique du destinataire" value={ekInput} onChange={setEkInput} placeholder="Collez ici la clé publique (base64)" rows={3} />
      <div className="row-end">
        <button className="btn btn-solid" onClick={encapsulate} disabled={!ekInput.trim()}>
          <IconLock size={16} />
          <span>Encapsuler</span>
        </button>
      </div>

      {result && (
        <div className="stack">
          <Output label="Secret partagé (K)" value={result.K} />
          <Output label="Texte encapsulé (c)" value={result.c}>
            <button className="btn btn-solid btn-sm" onClick={openPicker}>
              <IconSend size={15} />
              <span>Envoyer à</span>
            </button>
          </Output>

          {picker && (
            <div className="picker">
              <div className="picker-head">
                <strong>Choisir un destinataire</strong>
                <button className="btn btn-ghost btn-icon" onClick={() => setPicker(false)} aria-label="Fermer">
                  <IconX size={16} />
                </button>
              </div>
              {contacts.length === 0 ? (
                <p className="muted small">Aucune discussion pour l'instant. Démarrez-en une depuis l'onglet Discussions.</p>
              ) : (
                <ul className="picker-list">
                  {contacts.map((c) => (
                    <li key={c.username}>
                      <button className="picker-item" onClick={() => sendTo(c.username)}>
                        <Avatar name={c.username} size={30} />
                        <span>{c.username}</span>
                        <IconArrowRight size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Décapsuler ---------- */

function DecapsulatePanel({ username, onStatus }: { username: string; onStatus: (s: Status) => void }) {
  const [pairs, setPairs] = useState<StoredPair[]>([]);
  const [selected, setSelected] = useState("");
  const [cInput, setCInput] = useState("");
  const [K, setK] = useState<string | null>(null);

  useEffect(() => {
    listPairs(username).then((list) => {
      setPairs(list);
      setSelected((current) => current || list[0]?.id || "");
    });
  }, [username]);

  const pair = pairs.find((p) => p.id === selected);

  function decapsulate() {
    onStatus(null);
    setK(null);
    try {
      if (!pair) throw new Error("Choisissez une paire de clés locale.");
      let c: Uint8Array;
      try {
        c = fromBase64(cInput.trim());
      } catch {
        throw new Error("Texte encapsulé invalide : base64 attendu.");
      }
      if (c.length !== CT_SIZES[pair.variant]) {
        throw new Error(`Le texte encapsulé doit faire ${CT_SIZES[pair.variant]} octets pour ${pair.variant}.`);
      }
      setK(toBase64(decaps(fromBase64(pair.dk), c, pair.variant)));
      onStatus({ kind: "ok", text: "Décapsulation réussie." });
    } catch (err) {
      onStatus({ kind: "error", text: errText(err) });
    }
  }

  if (pairs.length === 0) {
    return (
      <EmptyState icon={<IconKey size={26} />} title="Aucune paire de clés" text="Générez d'abord une paire dans l'onglet Générer, pour pouvoir décapsuler." />
    );
  }

  return (
    <div className="stack-lg">
      <label className="field">
        <span className="field-label">Paire de clés à utiliser</span>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {pairs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.variant} · {p.fingerprint} · {formatWhen(p.createdAt)}
            </option>
          ))}
        </select>
      </label>

      <PasteField label="Texte encapsulé (c)" value={cInput} onChange={setCInput} placeholder="Collez ici le texte encapsulé (base64)" rows={3} />
      <div className="row-end">
        <button className="btn btn-solid" onClick={decapsulate} disabled={!cInput.trim()}>
          <IconUnlock size={16} />
          <span>Décapsuler</span>
        </button>
      </div>

      {K && <Output label="Secret partagé (K)" value={K} />}
      {K && <Notice kind="info" text="K est le secret partagé. Comparez son empreinte avec celle de l'expéditeur pour confirmer." />}
      {!K && pair && (
        <p className="muted small">
          <IconChat size={14} /> Paire active : {pair.variant}
        </p>
      )}
    </div>
  );
}

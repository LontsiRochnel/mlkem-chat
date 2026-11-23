import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { listPairs } from "../lib/keystore";
import { Avatar } from "./fields";
import { ChatPanel } from "./ChatPanel";
import { MlkemPanel } from "./MlkemPanel";
import { IconChat, IconKey, IconLogout, Logo } from "./Icons";

type Tab = "mlkem" | "chat";

/** Si le serveur n'a pas de clé publique mais que le navigateur en a une, propose de la republier. */
async function offerRepublish(username: string): Promise<void> {
  try {
    const me = await api.me();
    if (me.hasPublicKey) return;
    const pairs = await listPairs(username);
    if (pairs.length === 0) return;
    if (!window.confirm("Aucune clé publique n'est publiée sur le serveur. Republier votre dernière clé publique ?")) {
      return;
    }
    await api.publishKey(pairs[0].variant, pairs[0].ek);
  } catch {
    // Échec silencieux : l'action est reprise depuis la section ML-KEM.
  }
}

export function Home({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("mlkem");

  useEffect(() => {
    void offerRepublish(username);
  }, [username]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Logo size={30} />
          <span>ML-KEM Chat</span>
        </div>

        <nav className="tabs" aria-label="Sections">
          <button className={`tab ${tab === "mlkem" ? "is-active" : ""}`} onClick={() => setTab("mlkem")}>
            <IconKey size={17} />
            <span>ML-KEM</span>
          </button>
          <button className={`tab ${tab === "chat" ? "is-active" : ""}`} onClick={() => setTab("chat")}>
            <IconChat size={17} />
            <span>Discussions</span>
          </button>
        </nav>

        <div className="topbar-end">
          <div className="me">
            <Avatar name={username} size={32} />
            <span>{username}</span>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onLogout} title="Se déconnecter" aria-label="Se déconnecter">
            <IconLogout size={18} />
          </button>
        </div>
      </header>

      <main className="content">{tab === "mlkem" ? <MlkemPanel username={username} /> : <ChatPanel username={username} />}</main>
    </div>
  );
}

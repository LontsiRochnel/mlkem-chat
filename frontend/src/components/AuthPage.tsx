import { useState, type FormEvent } from "react";
import { api, ApiError, setSession } from "../lib/api";
import { errText, Notice } from "./fields";
import { IconEye, IconEyeOff, IconLock, IconShield, IconUser, Logo } from "./Icons";

/**
 * Connexion. Si le compte n'existe pas, une confirmation explicite est demandée
 * avant sa création.
 */
export function AuthPage({ onAuthenticated }: { onAuthenticated: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const name = username.trim().toLowerCase();
    try {
      try {
        const result = await api.login(name, password, false);
        setSession(result.token, result.username);
        onAuthenticated(result.username);
      } catch (err) {
        if (!(err instanceof ApiError && err.code === "USER_NOT_FOUND")) throw err;
        if (!window.confirm(`Ce compte n'existe pas. Voulez-vous créer le compte « ${name} » ?`)) return;
        const result = await api.login(name, password, true);
        setSession(result.token, result.username);
        onAuthenticated(result.username);
      }
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <aside className="auth-brand">
        <div className="brand brand-light">
          <Logo size={36} />
          <span>ML-KEM Chat</span>
        </div>
        <h2>Échangez des secrets, sans jamais exposer votre clé privée.</h2>
        <ul className="auth-points">
          <li>
            <IconShield size={18} />
            <span>Clés générées dans votre navigateur, jamais envoyées au serveur.</span>
          </li>
          <li>
            <IconLock size={18} />
            <span>Un secret partagé par encapsulation ML-KEM (FIPS 203).</span>
          </li>
          <li>
            <IconUser size={18} />
            <span>Un compte créé sur confirmation explicite.</span>
          </li>
        </ul>
      </aside>

      <main className="auth-main">
        <form className="card auth-form" onSubmit={submit}>
          <div>
            <h1>Connexion</h1>
            <p className="muted">Entrez vos identifiants pour continuer.</p>
          </div>

          <label className="field">
            <span className="field-label">Nom d'utilisateur</span>
            <div className="input-with-icon">
              <IconUser size={16} />
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
            </div>
          </label>

          <label className="field">
            <span className="field-label">Mot de passe</span>
            <div className="input-with-icon">
              <IconLock size={16} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-flat"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {showPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
              </button>
            </div>
          </label>

          {error && <Notice kind="error" text={error} />}

          <button type="submit" className="btn btn-solid btn-block" disabled={busy}>
            {busy ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </main>
    </div>
  );
}

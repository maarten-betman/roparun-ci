import { useState } from "react";
import { adminApi, AdminDisabledError, storeToken, UnauthorizedError } from "./adminApi";

/** Modal shown when the admin route is opened without a valid token in
 *  localStorage. On submit we validate the value by calling /admin/ping
 *  with it set; only then is it persisted. That avoids the "wrong token
 *  cached forever" trap. */
export function AuthPrompt({ onAuthed }: { onAuthed: () => void }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setError(null);
    // Validate by storing optimistically, then pinging. On failure we
    // clear and report — adminApi.clearToken() already runs on 401.
    storeToken(token.trim());
    try {
      await adminApi.ping();
      onAuthed();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        setError("Token afgewezen.");
      } else if (err instanceof AdminDisabledError) {
        setError(
          "Admin is uitgeschakeld op de server (ROPARUN_ADMIN_TOKEN niet gezet).",
        );
      } else {
        setError(`Onbekende fout: ${(err as Error).message}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin__auth-scrim">
      <form className="admin__auth-card" onSubmit={onSubmit}>
        <h2>Admin login</h2>
        <p className="admin__auth-hint">
          Vul de gedeelde <code>ROPARUN_ADMIN_TOKEN</code> in. Hij wordt in
          deze browser opgeslagen tot je uitlogt.
        </p>
        <input
          type="password"
          autoFocus
          autoComplete="off"
          placeholder="admin token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="admin__auth-input"
          aria-label="admin token"
        />
        {error && <div className="admin__auth-error">{error}</div>}
        <button type="submit" className="admin__auth-submit" disabled={busy}>
          {busy ? "Controleren…" : "Aanmelden"}
        </button>
      </form>
    </div>
  );
}

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { api, type DeviceRole, type PairingTokenOut } from "../api/client";

/** Planner-side UI for minting a pairing token and handing it to a phone
 *  via QR code + copyable URL. One token is minted at a time; "Regenerate"
 *  throws away the current one and mints a new one (the old one stays
 *  valid until its TTL expires, but crews typically only hand out the
 *  latest QR they see). */
export function PairingPanel({
  teamSlug,
  year,
}: {
  teamSlug: string;
  year: number;
}) {
  const [role, setRole] = useState<DeviceRole>("runner");
  const [token, setToken] = useState<PairingTokenOut | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!token) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [token]);

  useEffect(() => {
    if (!token) {
      setDataUrl(null);
      return;
    }
    const fullUrl = new URL(token.url_path, window.location.origin).toString();
    void QRCode.toDataURL(fullUrl, {
      margin: 1,
      scale: 6,
      color: { dark: "#0b3d91", light: "#ffffff" },
    }).then(setDataUrl);
  }, [token]);

  const mint = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const t = await api.createPairingToken({ team_slug: teamSlug, year, role });
      setToken(t);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fullUrl = token
    ? new URL(token.url_path, window.location.origin).toString()
    : "";
  const copy = async () => {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard may be unavailable in embedded contexts; the user can
      // manually select the URL instead.
    }
  };

  const remainingMs = token ? new Date(token.expires_at).getTime() - now : 0;
  const expired = remainingMs <= 0;

  return (
    <section style={{ marginBottom: 16 }}>
      <h2
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          color: "#6b7280",
          margin: "0 0 6px",
          letterSpacing: "0.05em",
        }}
      >
        Pair a device
      </h2>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as DeviceRole)}
          style={{ flex: 1, padding: 6, fontSize: 13 }}
        >
          <option value="runner">Runner</option>
          <option value="cyclist">Cyclist</option>
          <option value="driver">Driver</option>
        </select>
        <button
          type="button"
          onClick={mint}
          disabled={busy}
          style={{
            padding: "6px 10px",
            background: "#0b3d91",
            color: "#fff",
            border: 0,
            borderRadius: 6,
            fontSize: 13,
            cursor: busy ? "wait" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {token ? "Regenerate" : "Generate link"}
        </button>
      </div>
      {error && (
        <div
          style={{
            padding: 8,
            background: "#fee2e2",
            color: "#991b1b",
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}
      {token && dataUrl && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            padding: 10,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            background: "#f9fafb",
          }}
        >
          <img
            src={dataUrl}
            alt="Pairing QR"
            width={192}
            height={192}
            style={{ width: 192, height: 192 }}
          />
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            Role: <strong>{token.role}</strong> ·{" "}
            {expired ? "expired" : `expires in ${formatRemaining(remainingMs)}`}
          </div>
          <div style={{ display: "flex", gap: 6, width: "100%" }}>
            <input
              readOnly
              value={fullUrl}
              style={{
                flex: 1,
                padding: 4,
                fontSize: 11,
                fontFamily: "ui-monospace, monospace",
              }}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={copy}
              style={{
                padding: "4px 8px",
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {copied ? "✓" : "Copy"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            Scan on a phone or send the URL. The tracker only asks for a
            name — role is baked into the token. Single-use.
          </div>
        </div>
      )}
    </section>
  );
}

function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

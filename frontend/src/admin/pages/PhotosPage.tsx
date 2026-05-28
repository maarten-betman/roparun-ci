import { useEffect, useRef, useState } from "react";
import { adminApi, photoSrc, type PhotoAdmin } from "../adminApi";

interface UploadResult {
  name: string;
  ok: boolean;
  message?: string;
}

export function PhotosPage({ eventId }: { eventId: string | null }) {
  const [photos, setPhotos] = useState<PhotoAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = () => {
    if (!eventId) {
      setPhotos([]);
      return;
    }
    setLoading(true);
    adminApi
      .listPhotos(eventId)
      .then(setPhotos)
      .catch(() => setPhotos([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, [eventId]);

  const onFiles = async (files: FileList | null) => {
    if (!files || !eventId) return;
    setBusy(true);
    const out: UploadResult[] = [];
    for (const file of Array.from(files)) {
      try {
        await adminApi.uploadPhoto(eventId, file);
        out.push({ name: file.name, ok: true });
      } catch (e) {
        out.push({ name: file.name, ok: false, message: (e as Error).message });
      }
    }
    setResults(out);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    load();
  };

  const onDelete = async (p: PhotoAdmin) => {
    if (!window.confirm("Deze foto verwijderen?")) return;
    await adminApi.deletePhoto(p.id);
    load();
  };

  if (!eventId) {
    return (
      <div className="admin__page">
        <h2>Foto's</h2>
        <div className="admin__empty">Selecteer eerst een event bovenaan.</div>
      </div>
    );
  }

  const failures = results.filter((r) => !r.ok);
  const successes = results.filter((r) => r.ok).length;

  return (
    <div className="admin__page">
      <h2>Foto's</h2>
      <div className="admin__actions" style={{ marginBottom: 16 }}>
        <h3>Uploaden</h3>
        <div className="admin__action-row">
          <span className="admin__action-row-meta">
            Selecteer foto's met GPS-locatie in de EXIF. Ze verschijnen op de
            replay-tijdlijn op het moment dat ze genomen zijn. Foto's zonder
            GPS worden overgeslagen.
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            disabled={busy}
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>
        {busy && <div className="admin__action-row">Uploaden…</div>}
        {results.length > 0 && !busy && (
          <div className="admin__action-row" style={{ flexDirection: "column", alignItems: "flex-start" }}>
            {successes > 0 && (
              <span className="admin__action-result">{successes} foto('s) toegevoegd.</span>
            )}
            {failures.map((f) => (
              <span key={f.name} style={{ color: "#b45309", fontSize: 12 }}>
                ⚠️ {f.name}: {f.message}
              </span>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="admin__empty">Laden…</div>
      ) : photos.length === 0 ? (
        <div className="admin__empty">Nog geen foto's voor dit event.</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 12,
          }}
        >
          {photos.map((p) => (
            <div
              key={p.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              <img
                src={photoSrc(p.url)}
                alt={p.caption ?? ""}
                style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }}
                loading="lazy"
              />
              <div style={{ padding: 8, fontSize: 11, color: "#6b7280" }}>
                <div>
                  {p.taken_at
                    ? new Date(p.taken_at).toLocaleString("nl-NL", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })
                    : "geen tijd"}
                </div>
                <div>
                  {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                </div>
                <button
                  type="button"
                  className="is-danger"
                  onClick={() => onDelete(p)}
                  style={{
                    marginTop: 6,
                    padding: "3px 8px",
                    fontSize: 12,
                    border: "1px solid #fca5a5",
                    color: "#b91c1c",
                    background: "#fff",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  Verwijder
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

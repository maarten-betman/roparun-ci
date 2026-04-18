import React, { useState } from "react";
import ReactDOM from "react-dom/client";

function Tracker() {
  const [status, setStatus] = useState<string>("Not started");
  const [position, setPosition] = useState<GeolocationPosition | null>(null);

  const start = () => {
    if (!("geolocation" in navigator)) {
      setStatus("Geolocation unsupported");
      return;
    }
    setStatus("Watching…");
    navigator.geolocation.watchPosition(
      (pos) => setPosition(pos),
      (err) => setStatus(`Error: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
    );
  };

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: 24,
        maxWidth: 480,
        margin: "0 auto",
      }}
    >
      <h1 style={{ color: "#0b3d91" }}>Roparun Tracker</h1>
      <p>Pairing + background streaming come in Phase 3. This is the foreground stub.</p>
      <button
        onClick={start}
        style={{
          background: "#0b3d91",
          color: "white",
          border: 0,
          padding: "12px 16px",
          borderRadius: 8,
          fontSize: 16,
        }}
      >
        Start location watch
      </button>
      <p style={{ marginTop: 16 }}>Status: {status}</p>
      {position && (
        <pre style={{ background: "#f3f4f6", padding: 12, borderRadius: 8, overflow: "auto" }}>
          {JSON.stringify(
            {
              lat: position.coords.latitude,
              lon: position.coords.longitude,
              accuracy: position.coords.accuracy,
              ts: new Date(position.timestamp).toISOString(),
            },
            null,
            2,
          )}
        </pre>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Tracker />
  </React.StrictMode>,
);

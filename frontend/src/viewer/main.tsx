import React from "react";
import ReactDOM from "react-dom/client";
import { Map } from "../map/Map";

const apiKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

function App() {
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Map apiKey={apiKey} />
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          background: "rgba(11, 61, 145, 0.9)",
          color: "white",
          padding: "12px 16px",
          borderRadius: 8,
          fontFamily: "system-ui, sans-serif",
          zIndex: 1,
        }}
      >
        <strong>Roparun · Route viewer</strong>
        <div style={{ fontSize: 12, opacity: 0.8 }}>Placeholder Paris → Rotterdam</div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

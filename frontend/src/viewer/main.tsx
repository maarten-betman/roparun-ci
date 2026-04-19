import React from "react";
import ReactDOM from "react-dom/client";
import "../styles/tokens.css";
import { Planner } from "../planner/Planner";
import { Viewer } from "./Viewer";

const apiKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

function pickView() {
  const path = window.location.pathname;
  if (path.startsWith("/planner")) return <Planner apiKey={apiKey} />;
  // `/t/:slug/:year` → public route for a given team + year.
  const m = path.match(/^\/t\/([^/]+)\/([^/]+)/);
  if (m) return <Viewer apiKey={apiKey} publicPath={`${m[1]}/${m[2]}`} />;
  return <Viewer apiKey={apiKey} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{pickView()}</React.StrictMode>,
);

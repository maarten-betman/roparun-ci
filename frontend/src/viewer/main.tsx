import React from "react";
import ReactDOM from "react-dom/client";
import "../styles/tokens.css";
import { Admin } from "../admin/Admin";
import { Hulp } from "../hulp/Hulp";
import { Planner } from "../planner/Planner";
import { Replay } from "../replay/Replay";
import { Viewer } from "./Viewer";

const apiKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

// Single-tenant default: any unknown / root path loads the Conclusion
// Intelligence 2026 route instead of the placeholder line. Revisit if we
// ever host a second team.
const DEFAULT_PUBLIC_PATH = "conclusion/2026";

function pickView() {
  const path = window.location.pathname;
  if (path.startsWith("/admin")) return <Admin />;
  if (path.startsWith("/planner")) return <Planner apiKey={apiKey} />;
  if (path.startsWith("/hulp")) return <Hulp />;
  // `/replay` and `/replay/:slug/:year` → race replay page.
  const rm = path.match(/^\/replay(?:\/([^/]+)\/([^/]+))?/);
  if (rm) {
    const pp = rm[1] && rm[2] ? `${rm[1]}/${rm[2]}` : DEFAULT_PUBLIC_PATH;
    return <Replay apiKey={apiKey} publicPath={pp} />;
  }
  // `/t/:slug/:year` → public route for a given team + year.
  const m = path.match(/^\/t\/([^/]+)\/([^/]+)/);
  if (m) return <Viewer apiKey={apiKey} publicPath={`${m[1]}/${m[2]}`} />;
  return <Viewer apiKey={apiKey} publicPath={DEFAULT_PUBLIC_PATH} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{pickView()}</React.StrictMode>,
);

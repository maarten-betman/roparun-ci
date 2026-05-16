import { useEffect, useMemo, useState } from "react";
import type { EventSummary } from "../api/types";
import { TopBar } from "../chrome/TopBar";
import "./admin.css";
import {
  adminApi,
  AdminDisabledError,
  clearToken,
  getStoredToken,
  UnauthorizedError,
} from "./adminApi";
import { AuthPrompt } from "./AuthPrompt";
import { ChangeEventsPage } from "./pages/ChangeEventsPage";
import { Dashboard } from "./pages/Dashboard";
import { DevicesPage } from "./pages/DevicesPage";
import { EventsPage } from "./pages/EventsPage";
import { PositionsPage } from "./pages/PositionsPage";
import { RoutesPage } from "./pages/RoutesPage";
import { TeamsPage } from "./pages/TeamsPage";
import { WaypointsPage } from "./pages/WaypointsPage";

type PageKey =
  | "dashboard"
  | "routes"
  | "waypoints"
  | "devices"
  | "positions"
  | "changes"
  | "teams"
  | "events";

const TABS: { key: PageKey; label: string; path: string }[] = [
  { key: "dashboard", label: "Dashboard", path: "/admin" },
  { key: "routes", label: "Routes", path: "/admin/routes" },
  { key: "waypoints", label: "Waypoints", path: "/admin/waypoints" },
  { key: "devices", label: "Devices", path: "/admin/devices" },
  { key: "positions", label: "Posities", path: "/admin/positions" },
  { key: "changes", label: "Wissels", path: "/admin/changes" },
  { key: "teams", label: "Teams", path: "/admin/teams" },
  { key: "events", label: "Events", path: "/admin/events" },
];

function pageFromPath(pathname: string): PageKey {
  const seg = pathname.replace(/^\/admin\/?/, "").split("/")[0] ?? "";
  const tab = TABS.find((t) => t.path.endsWith(`/${seg}`) && seg !== "");
  return tab?.key ?? "dashboard";
}

export function Admin() {
  // Auth gate. authed===null means "not checked yet"; null+token absent
  // jumps straight to the prompt.
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [page, setPage] = useState<PageKey>(() => pageFromPath(window.location.pathname));
  // Single event-id shared across sub-pages so user doesn't have to pick
  // per tab. Persisted in localStorage.
  const [eventId, setEventId] = useState<string | null>(
    () => localStorage.getItem("roparun.adminEventId"),
  );
  const [events, setEvents] = useState<EventSummary[]>([]);

  // Bootstrap auth: if a token is in localStorage, validate it via /ping.
  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAuthed(false);
      return;
    }
    adminApi
      .ping()
      .then(() => setAuthed(true))
      .catch((err) => {
        if (err instanceof AdminDisabledError) {
          setDisabled(true);
          setAuthed(false);
        } else if (err instanceof UnauthorizedError) {
          setAuthed(false);
        } else {
          setAuthed(false);
        }
      });
  }, []);

  // Listen for back/forward.
  useEffect(() => {
    const onPop = () => setPage(pageFromPath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Load events list once authed so all pages can use it.
  useEffect(() => {
    if (!authed) return;
    void adminApi
      .listEvents()
      .then((list) => {
        setEvents(list);
        if (!eventId && list.length > 0) {
          setEventId(list[0].id);
          localStorage.setItem("roparun.adminEventId", list[0].id);
        }
      })
      .catch(() => void 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  const onNavigate = (path: string) => {
    history.pushState(null, "", path);
    setPage(pageFromPath(path));
  };

  const onEventChange = (id: string) => {
    setEventId(id);
    localStorage.setItem("roparun.adminEventId", id);
  };

  const logout = () => {
    clearToken();
    localStorage.removeItem("roparun.adminEventId");
    window.location.reload();
  };

  const currentEvent = useMemo(
    () => events.find((e) => e.id === eventId) ?? null,
    [events, eventId],
  );

  if (authed === null) {
    return (
      <div className="admin">
        <TopBar title="Admin" />
        <div className="admin__loading">Laden…</div>
      </div>
    );
  }
  if (disabled) {
    return (
      <div className="admin">
        <TopBar title="Admin" />
        <div className="admin__disabled">
          <h2>Admin uitgeschakeld</h2>
          <p>
            Stel <code>ROPARUN_ADMIN_TOKEN</code> in op de server (Coolify →
            env vars) en herstart de api container.
          </p>
        </div>
      </div>
    );
  }
  if (!authed) {
    return (
      <div className="admin">
        <TopBar title="Admin" />
        <AuthPrompt onAuthed={() => setAuthed(true)} />
      </div>
    );
  }

  return (
    <div className="admin">
      <TopBar
        title="Admin"
        meta={currentEvent ? `${currentEvent.year}` : undefined}
        actions={
          <button
            type="button"
            onClick={logout}
            className="topbar__btn topbar__btn--ghost"
          >
            Logout
          </button>
        }
      />
      <nav className="admin__subnav" aria-label="Admin secties">
        {TABS.map((t) => (
          <a
            key={t.key}
            href={t.path}
            className={`admin__subnav-link ${
              t.key === page ? "admin__subnav-link--active" : ""
            }`}
            aria-current={t.key === page ? "page" : undefined}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              onNavigate(t.path);
            }}
          >
            {t.label}
          </a>
        ))}
        <div className="admin__subnav-spacer" />
        <div className="admin__event-picker">
          <label>
            Event:
            <select
              value={eventId ?? ""}
              onChange={(e) => onEventChange(e.target.value)}
              disabled={events.length === 0}
            >
              {events.length === 0 && <option value="">— geen events —</option>}
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.year} · {ev.start_city}
                </option>
              ))}
            </select>
          </label>
        </div>
      </nav>

      <main className="admin__main">
        {page === "dashboard" && <Dashboard eventId={eventId} />}
        {page === "routes" && <RoutesPage eventId={eventId} />}
        {page === "waypoints" && <WaypointsPage eventId={eventId} />}
        {page === "devices" && <DevicesPage eventId={eventId} />}
        {page === "positions" && <PositionsPage eventId={eventId} />}
        {page === "changes" && <ChangeEventsPage eventId={eventId} />}
        {page === "teams" && <TeamsPage />}
        {page === "events" && <EventsPage />}
      </main>
    </div>
  );
}

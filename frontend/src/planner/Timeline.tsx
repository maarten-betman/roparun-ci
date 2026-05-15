import { useEffect, useMemo, useRef, useState } from "react";
import { fmtTeamChangeTime, minutesFromStart } from "./paceTime";
import "./timeline.css";

interface TeamChangePoint {
  key: string;
  alongM: number;
  offsetMin: number;
  name: string;
}

interface TimelineProps {
  totalM: number;
  startAt: Date | null;
  paceMinKm: number;
  teamChanges: TeamChangePoint[];
  /** Called with the runners-track distance under the cursor, or null
   *  when the cursor leaves the bar. Parent uses it to drop a ghost
   *  marker on the map at that distance. */
  onHoverDistance: (d: number | null) => void;
}

/** Pick a tick interval (hours) that gives at least ~70 px per label
 *  for the currently-measured bar width. Falls back to a coarser
 *  spacing on phones so "za 15:00" labels don't crash into "za 21:00". */
function pickTickHours(totalHours: number, barWidth: number): number {
  // ~70 px per label keeps a "za 15:00" + margin from overlapping its
  // neighbour. On a 1200 px desktop that's up to ~17 labels; on a
  // ~340 px phone it caps us at ~4 labels.
  const minLabelPx = 70;
  const maxLabels = Math.max(2, Math.floor((barWidth || 800) / minLabelPx));
  const minStep = totalHours / Math.max(1, maxLabels - 1);
  const candidates = [0.5, 1, 2, 3, 4, 6, 8, 12, 24];
  for (const c of candidates) {
    if (c >= minStep) return c;
  }
  return Math.ceil(minStep);
}

/** Cumulative-offset at a point on the track: sum of offsets of every
 *  team change whose alongM is <= the queried distance. */
function cumulativeOffsetAt(distanceM: number, teamChanges: TeamChangePoint[]): number {
  let sum = 0;
  for (const tc of teamChanges) {
    if (tc.alongM <= distanceM) sum += tc.offsetMin;
  }
  return sum;
}

export function Timeline({
  totalM,
  startAt,
  paceMinKm,
  teamChanges,
  onHoverDistance,
}: TimelineProps) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverDistanceM, setHoverDistanceM] = useState<number | null>(null);
  // Bar width tracked via ResizeObserver so the tick interval can drop
  // labels on phones without losing them when rotating to landscape.
  const [barWidth, setBarWidth] = useState(0);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    setBarWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      setBarWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totalMinutes = useMemo(
    () => minutesFromStart(totalM, paceMinKm, 0),
    [totalM, paceMinKm],
  );

  // Time-axis ticks. We anchor them on `startAt` when set so labels land
  // on round wall-clock times ("Sa 15:00", "Sa 21:00" …); without a
  // start moment we just show elapsed hours from km 0.
  const ticks = useMemo(() => {
    if (totalM <= 0 || paceMinKm <= 0) return [];
    const totalHours = totalMinutes / 60;
    const step = pickTickHours(totalHours, barWidth);
    const out: { mins: number; label: string }[] = [];
    for (let h = 0; h <= totalHours + 0.001; h += step) {
      const mins = h * 60;
      const label = startAt
        ? new Date(startAt.getTime() + mins * 60_000).toLocaleString("nl-NL", {
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
          })
        : `${Math.round(h)}h`;
      out.push({ mins, label });
    }
    return out;
  }, [totalM, totalMinutes, paceMinKm, startAt, barWidth]);

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = barRef.current;
    if (!bar || totalM <= 0) return;
    const rect = bar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frac = Math.max(0, Math.min(1, x / rect.width));
    const d = frac * totalM;
    setHoverX(x);
    setHoverDistanceM(d);
    onHoverDistance(d);
  };

  const onMouseLeave = () => {
    setHoverX(null);
    setHoverDistanceM(null);
    onHoverDistance(null);
  };

  if (totalM <= 0) {
    return <div className="planner__timeline planner__timeline--empty">Geen lopersroute geladen</div>;
  }

  const cursorFrac = hoverDistanceM != null ? hoverDistanceM / totalM : null;
  const cursorOffsetMin =
    hoverDistanceM != null ? cumulativeOffsetAt(hoverDistanceM, teamChanges) : 0;
  const cursorEta =
    hoverDistanceM != null
      ? fmtTeamChangeTime(hoverDistanceM, paceMinKm, startAt, cursorOffsetMin)
      : null;
  const cursorKm = hoverDistanceM != null ? (hoverDistanceM / 1000).toFixed(1) : null;

  return (
    <div
      ref={barRef}
      className="planner__timeline"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      aria-label="Tijdlijn van de lopersroute"
    >
      {/* Axis labels. */}
      <div className="planner__timeline-axis">
        {ticks.map((t) => (
          <span
            key={t.mins}
            className="planner__timeline-axis-label"
            style={{ left: `${(t.mins / totalMinutes) * 100}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>

      {/* The bar + tick marks + team change pips. */}
      <div className="planner__timeline-track">
        <div className="planner__timeline-track-line" />
        {ticks.map((t) => (
          <span
            key={`tick-${t.mins}`}
            className="planner__timeline-tick"
            style={{ left: `${(t.mins / totalMinutes) * 100}%` }}
          />
        ))}
        {teamChanges.map((tc, i) => {
          const frac = tc.alongM / totalM;
          return (
            <span
              key={tc.key}
              className="planner__timeline-pip"
              style={{ left: `${frac * 100}%` }}
              title={tc.name || `Wissel #${i + 1}`}
            />
          );
        })}

        {cursorFrac != null && (
          <div
            className="planner__timeline-cursor"
            style={{ left: `${cursorFrac * 100}%` }}
            aria-hidden
          />
        )}
      </div>

      {/* Floating tooltip near the cursor. Clamped so it doesn't run off
          the right edge. */}
      {hoverX != null && cursorEta && cursorKm && (
        <div
          className="planner__timeline-tip"
          style={{
            left: hoverX,
            // Translate left at the right edge so the tip stays visible.
            transform: `translateX(${cursorFrac! > 0.85 ? "-100%" : "0"})`,
          }}
        >
          <strong>km {cursorKm}</strong>
          <span> · {cursorEta}</span>
          {cursorOffsetMin !== 0 && (
            <span className="planner__timeline-tip-offset">
              {" "}
              ({cursorOffsetMin > 0 ? "+" : ""}
              {cursorOffsetMin}m cumulatief)
            </span>
          )}
        </div>
      )}
    </div>
  );
}

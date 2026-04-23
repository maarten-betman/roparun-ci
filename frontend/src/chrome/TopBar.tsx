import "./topbar.css";

export interface TopBarProps {
  /** "Route viewer" / "Planner" / etc. */
  title: string;
  /** Small meta line shown to the right of the title, e.g. "2026" or "2026 · draft". */
  meta?: string;
  /** Route version label — "V1" / "V2" / "V3" renders a yellow "concept" pill. "V4" or null hides it. */
  versionLabel?: string | null;
  /** Optional actions rendered on the right (buttons). */
  actions?: React.ReactNode;
  /** Current page key — drives the highlighted item in the nav row. */
  currentPage?: "viewer" | "planner" | "tracker";
}

const NAV_ITEMS: { key: "viewer" | "planner" | "tracker"; label: string; href: string }[] = [
  { key: "viewer", label: "Viewer", href: "/" },
  { key: "planner", label: "Planner", href: "/planner" },
  { key: "tracker", label: "Tracker", href: "/tracker.html" },
];

/** Top bar with Conclusion Intelligence branding. Used by Viewer and Planner.
 *  The logo chip sits on a white background so it stays legible on navy. */
export function TopBar({ title, meta, versionLabel, actions, currentPage }: TopBarProps) {
  const showConceptPill = versionLabel && /^V0?[1-3]$/i.test(versionLabel);
  return (
    <header className="topbar">
      <div className="topbar__logo-chip">
        <img
          src="/assets/conclusion-intelligence-logo.png"
          alt="Conclusion Intelligence"
          className="topbar__logo"
        />
      </div>
      <div className="topbar__divider" />
      <div className="topbar__title">{title}</div>
      {meta && <div className="topbar__meta">{meta}</div>}
      {currentPage && (
        <nav className="topbar__nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.key}
              href={item.href}
              className={`topbar__navlink ${
                item.key === currentPage ? "topbar__navlink--active" : ""
              }`}
              aria-current={item.key === currentPage ? "page" : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
      )}
      <div className="topbar__spacer" />
      {showConceptPill && (
        <div
          className="topbar__pill"
          title="Final V4 data is published the Friday before the event"
        >
          {versionLabel} concept
        </div>
      )}
      {actions}
    </header>
  );
}

/** Action button used inside TopBar. Variants match the design: "primary"
 *  (white pill with navy text for the CTA) and "ghost" (outlined). */
export function TopBarButton({
  children,
  variant = "ghost",
  onClick,
  href,
  download,
}: {
  children: React.ReactNode;
  variant?: "primary" | "ghost";
  onClick?: () => void;
  href?: string;
  download?: boolean;
}) {
  const className = `topbar__btn topbar__btn--${variant}`;
  if (href) {
    return (
      <a href={href} download={download} className={className}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}

import { useEffect, useState } from "react";
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
  currentPage?: "viewer" | "planner" | "tracker" | "hulp";
}

type NavKey = "viewer" | "planner" | "tracker" | "hulp";

const NavIcon = ({ icon }: { icon: NavKey }) => {
  // Heroicons-style 20×20 outline; kept inline so the drawer stays
  // dependency-free and the icons inherit `currentColor`.
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (icon) {
    case "viewer":
      // Map-pin.
      return (
        <svg {...common}>
          <path d="M12 21s-7-5.5-7-12a7 7 0 0 1 14 0c0 6.5-7 12-7 12Z" />
          <circle cx="12" cy="9" r="2.5" />
        </svg>
      );
    case "planner":
      // Pencil on a line (editing).
      return (
        <svg {...common}>
          <path d="M4 20h4l10-10-4-4L4 16v4Z" />
          <path d="M13.5 6.5l4 4" />
        </svg>
      );
    case "tracker":
      // Antenna / signal bars.
      return (
        <svg {...common}>
          <path d="M5 18c2-2 2-5 0-7" />
          <path d="M19 18c-2-2-2-5 0-7" />
          <path d="M8.5 16c.9-.9 1-2.6 0-3.5" />
          <path d="M15.5 16c-.9-.9-1-2.6 0-3.5" />
          <circle cx="12" cy="14" r="1.5" />
          <path d="M12 15.5V21" />
        </svg>
      );
    case "hulp":
      // Question mark in a circle.
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .7-1 1.4v.3" />
          <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      );
  }
};

const NAV_ITEMS: {
  key: NavKey;
  label: string;
  subtitle: string;
  href: string;
}[] = [
  { key: "viewer", label: "Viewer", subtitle: "Publieke kaart", href: "/" },
  { key: "planner", label: "Planner", subtitle: "Route bewerken", href: "/planner" },
  { key: "tracker", label: "Tracker", subtitle: "Live positie sturen", href: "/tracker.html" },
  { key: "hulp", label: "Hulp", subtitle: "Handleiding", href: "/hulp" },
];

/** Top bar with Conclusion Intelligence branding. Used by Viewer and Planner.
 *  The logo chip sits on a white background so it stays legible on navy.
 *  On phones (<=720 px) the logo slot becomes a hamburger that toggles a
 *  drawer with the primary nav — the brand wordmark isn't worth the pixels
 *  when the viewer/planner/tracker hop is what crew actually need. */
export function TopBar({ title, meta, versionLabel, actions, currentPage }: TopBarProps) {
  const showConceptPill = versionLabel && /^V0?[1-3]$/i.test(versionLabel);
  const [menuOpen, setMenuOpen] = useState(false);

  // Auto-close when viewport grows past the mobile breakpoint so the inline
  // nav takes over cleanly without a stale drawer sticking around.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 721px)");
    const close = () => setMenuOpen(false);
    mq.addEventListener("change", close);
    return () => mq.removeEventListener("change", close);
  }, []);

  // Close the drawer on Escape for keyboard users.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <>
      <header className="topbar">
        <button
          type="button"
          className="topbar__hamburger"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="topbar-drawer"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className={`topbar__hamburger-bar ${menuOpen ? "is-x-top" : ""}`} />
          <span className={`topbar__hamburger-bar ${menuOpen ? "is-x-mid" : ""}`} />
          <span className={`topbar__hamburger-bar ${menuOpen ? "is-x-bot" : ""}`} />
        </button>
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
      <div
        className={`topbar__drawer-scrim ${menuOpen ? "is-open" : ""}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />
      <div
        id="topbar-drawer"
        className={`topbar__drawer ${menuOpen ? "is-open" : ""}`}
        role="dialog"
        aria-label="Menu"
        aria-hidden={!menuOpen}
      >
        <div className="topbar__drawer-header">
          <img
            src="/assets/conclusion-intelligence-logo.png"
            alt=""
            className="topbar__drawer-logo"
          />
          <div>
            <div className="topbar__drawer-brand">Conclusion Intelligence</div>
            <div className="topbar__drawer-brand-sub">
              Roparun {meta ?? "2026"}
              {showConceptPill ? ` · ${versionLabel} concept` : ""}
            </div>
          </div>
        </div>
        <nav className="topbar__drawer-nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const isActive = item.key === currentPage;
            return (
              <a
                key={item.key}
                href={item.href}
                className={`topbar__drawer-link ${isActive ? "is-active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
                tabIndex={menuOpen ? 0 : -1}
              >
                <span className="topbar__drawer-icon">
                  <NavIcon icon={item.key} />
                </span>
                <span className="topbar__drawer-label">
                  <span className="topbar__drawer-title">{item.label}</span>
                  <span className="topbar__drawer-subtitle">{item.subtitle}</span>
                </span>
                <span className="topbar__drawer-chevron" aria-hidden="true">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                </span>
              </a>
            );
          })}
        </nav>
      </div>
    </>
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

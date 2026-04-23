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
  currentPage?: "viewer" | "planner" | "tracker";
}

const NAV_ITEMS: { key: "viewer" | "planner" | "tracker"; label: string; href: string }[] = [
  { key: "viewer", label: "Viewer", href: "/" },
  { key: "planner", label: "Planner", href: "/planner" },
  { key: "tracker", label: "Tracker", href: "/tracker.html" },
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
      {menuOpen && (
        <>
          <div
            className="topbar__drawer-scrim"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div
            id="topbar-drawer"
            className="topbar__drawer"
            role="dialog"
            aria-label="Menu"
          >
            <nav className="topbar__drawer-nav" aria-label="Primary">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.key}
                  href={item.href}
                  className={`topbar__drawer-link ${
                    item.key === currentPage ? "topbar__drawer-link--active" : ""
                  }`}
                  aria-current={item.key === currentPage ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </>
      )}
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

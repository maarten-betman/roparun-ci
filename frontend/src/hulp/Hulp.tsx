import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TopBar } from "../chrome/TopBar";
import "./hulp.css";

// Raw-imported markdown — single source of truth lives in /docs/gebruik.
// Vite bundles these at build time; no runtime fetch, works offline once
// the page is loaded.
import overzichtMd from "../../../docs/gebruik/README.md?raw";
import viewerMd from "../../../docs/gebruik/viewer.md?raw";
import plannerMd from "../../../docs/gebruik/planner.md?raw";
import koppelenMd from "../../../docs/gebruik/koppelen.md?raw";
import trackerMd from "../../../docs/gebruik/tracker.md?raw";
import probleemoplossingMd from "../../../docs/gebruik/probleemoplossing.md?raw";

interface Page {
  slug: string;
  title: string;
  source: string;
}

const PAGES: Page[] = [
  { slug: "", title: "Overzicht", source: overzichtMd },
  { slug: "viewer", title: "Viewer", source: viewerMd },
  { slug: "planner", title: "Planner", source: plannerMd },
  { slug: "koppelen", title: "Telefoon koppelen", source: koppelenMd },
  { slug: "tracker", title: "Tracker PWA", source: trackerMd },
  { slug: "probleemoplossing", title: "Probleemoplossing", source: probleemoplossingMd },
];

function slugFromPath(pathname: string): string {
  // "/hulp" → "", "/hulp/viewer" → "viewer"
  const m = pathname.match(/^\/hulp\/?([^/?#]*)/);
  return m ? m[1] : "";
}

/** Rewrites repo-relative URLs to the ones the site serves:
 *   ./viewer.md                → /hulp/viewer
 *   ./viewer.md#foo            → /hulp/viewer#foo
 *   ./img/x.png                → /hulp/img/x.png
 *   anchors (#foo) and absolute URLs pass through unchanged.
 */
function rewriteUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("#") || url.startsWith("http") || url.startsWith("/")) {
    return url;
  }
  if (url.startsWith("./img/") || url.startsWith("img/")) {
    return url.replace(/^\.?\/?img\//, "/hulp/img/");
  }
  // ./README.md → /hulp, ./viewer.md → /hulp/viewer, preserve ?query#hash.
  const mdMatch = url.match(/^\.?\/?([^#?]+?)\.md(.*)$/);
  if (mdMatch) {
    const base = mdMatch[1] === "README" ? "" : mdMatch[1];
    const suffix = mdMatch[2];
    return `/hulp${base ? `/${base}` : ""}${suffix}`;
  }
  return url;
}

export function Hulp() {
  const [slug, setSlug] = useState<string>(() => slugFromPath(window.location.pathname));

  // Back/forward navigation — keep React state in sync with the URL.
  useEffect(() => {
    const onPop = () => setSlug(slugFromPath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Scroll to top (or to the #hash anchor) when switching pages.
  useEffect(() => {
    if (window.location.hash) {
      const el = document.getElementById(window.location.hash.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: "instant" });
        return;
      }
    }
    document.querySelector(".hulp__content")?.scrollTo(0, 0);
  }, [slug]);

  const page = useMemo(() => PAGES.find((p) => p.slug === slug) ?? PAGES[0], [slug]);

  const onLinkClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest("a");
    if (!target) return;
    const href = target.getAttribute("href");
    if (!href) return;
    // Let external links and new-tab clicks behave normally.
    if (href.startsWith("http") || target.target === "_blank" || e.metaKey || e.ctrlKey) return;
    if (href.startsWith("/hulp")) {
      e.preventDefault();
      history.pushState(null, "", href);
      const hashIdx = href.indexOf("#");
      const pathPart = hashIdx === -1 ? href : href.slice(0, hashIdx);
      setSlug(slugFromPath(pathPart));
    }
  };

  const goTo = (slug: string) => {
    const path = slug ? `/hulp/${slug}` : "/hulp";
    history.pushState(null, "", path);
    setSlug(slug);
  };

  return (
    <div className="hulp">
      <TopBar title="Handleiding" meta="Nederlands" currentPage="hulp" />
      <div className="hulp__layout">
        <aside className="hulp__sidebar" aria-label="Handleiding-navigatie">
          <nav>
            <ul>
              {PAGES.map((p) => (
                <li key={p.slug}>
                  <a
                    href={p.slug ? `/hulp/${p.slug}` : "/hulp"}
                    className={p.slug === slug ? "is-active" : ""}
                    aria-current={p.slug === slug ? "page" : undefined}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey) return;
                      e.preventDefault();
                      goTo(p.slug);
                    }}
                  >
                    {p.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        <main className="hulp__content" onClick={onLinkClick}>
          <article className="hulp__article">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              urlTransform={rewriteUrl}
            >
              {page.source}
            </ReactMarkdown>
          </article>
        </main>
      </div>
    </div>
  );
}

// Exported for testability — kept pure so a unit test can exercise all
// rewrite cases without spinning up React.
export { rewriteUrl };

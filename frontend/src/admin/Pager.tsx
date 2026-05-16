export interface OffsetPagerProps {
  offset: number;
  limit: number;
  total: number;
  onChange: (offset: number) => void;
}

/** Numeric pager for offset/limit endpoints. Shows "1–50 of 312" + prev/next. */
export function OffsetPager({ offset, limit, total, onChange }: OffsetPagerProps) {
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + limit, total);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;
  return (
    <div className="admin__pager">
      <span className="admin__pager-meta">
        {first}–{last} van {total}
      </span>
      <button
        type="button"
        disabled={!canPrev}
        onClick={() => onChange(Math.max(0, offset - limit))}
      >
        ‹ Vorige
      </button>
      <button
        type="button"
        disabled={!canNext}
        onClick={() => onChange(offset + limit)}
      >
        Volgende ›
      </button>
    </div>
  );
}

export interface CursorPagerProps {
  /** Stack of cursors we've used; index = current page (0-based). */
  stack: (string | null)[];
  nextCursor: string | null;
  onPush: (cursor: string) => void;
  onPop: () => void;
  /** Convenience text shown next to the buttons. */
  pageSize: number;
  itemsThisPage: number;
}

/** Cursor-based pager (used by Positions). Keeps a simple stack of
 *  cursors client-side so we can step backwards without re-querying. */
export function CursorPager({
  stack,
  nextCursor,
  onPush,
  onPop,
  pageSize,
  itemsThisPage,
}: CursorPagerProps) {
  const page = stack.length; // 0 = first page
  return (
    <div className="admin__pager">
      <span className="admin__pager-meta">
        Pagina {page + 1} · {itemsThisPage}/{pageSize}
      </span>
      <button type="button" disabled={page === 0} onClick={onPop}>
        ‹ Vorige
      </button>
      <button
        type="button"
        disabled={!nextCursor}
        onClick={() => nextCursor && onPush(nextCursor)}
      >
        Volgende ›
      </button>
    </div>
  );
}

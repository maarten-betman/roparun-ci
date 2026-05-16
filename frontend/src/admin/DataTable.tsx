import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  /** Custom cell renderer; falls back to `String(row[key])` for plain
   *  scalar fields. */
  render?: (row: T) => ReactNode;
  /** Optional column width hint (CSS value). */
  width?: string;
  /** Right-align numeric columns. */
  numeric?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Per-row action buttons. Rendered in a final "Acties" column. */
  rowActions?: (row: T) => ReactNode;
  empty?: ReactNode;
}

/** Generic table for the admin pages. No virtualization, no sorting —
 *  the data scale is small (low thousands max per filtered view) and
 *  the backend already orders rows. Keeps the component tiny. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowActions,
  empty,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return <div className="admin__empty">{empty ?? "Geen rijen."}</div>;
  }
  return (
    <table className="admin__table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={c.key}
              style={{
                width: c.width,
                textAlign: c.numeric ? "right" : "left",
              }}
            >
              {c.header}
            </th>
          ))}
          {rowActions && <th style={{ width: 100 }}>Acties</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((c) => (
              <td key={c.key} style={{ textAlign: c.numeric ? "right" : "left" }}>
                {c.render
                  ? c.render(row)
                  : String((row as Record<string, unknown>)[c.key] ?? "")}
              </td>
            ))}
            {rowActions && <td className="admin__row-actions">{rowActions(row)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

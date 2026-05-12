import { useMemo, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { formatNumber, safeText } from "../utils/erpFormat";

function TableRowSkeleton({ colCount }) {
  return (
    <tr className="erp-skeleton">
      {Array.from({ length: colCount }).map((_, i) => (
        <td key={i}>
          <div
            className={`erp-skeleton-line ${i === 0 ? "erp-skeleton-line--w80" : "erp-skeleton-line--w60"}`}
          />
        </td>
      ))}
    </tr>
  );
}

/**
 * Enterprise table: sticky header, zebra, hover, client search, pagination.
 * @param {object} props
 * @param {{ key: string, header: string, align?: string, numeric?: boolean, render?: function, searchAccessor?: function }[]} props.columns
 * @param {object[]} props.rows
 * @param {function} props.getRowId
 * @param {number} [props.pageSize=10]
 * @param {boolean} props.loading
 * @param {boolean} props.showSkeleton
 * @param {string} props.emptyTitle
 * @param {string} [props.emptyHint]
 */
export default function ErpDataTable({
  columns,
  rows,
  getRowId,
  pageSize = 10,
  loading = false,
  showSkeleton = false,
  emptyTitle = "No records",
  emptyHint = "Try adjusting filters or date range.",
  searchPlaceholder = "Search…",
}) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      columns.some((col) => {
        const acc = col.searchAccessor || ((r) => r[col.key]);
        try {
          const v = acc(row);
          return String(v != null ? v : "")
            .toLowerCase()
            .includes(q);
        } catch {
          return false;
        }
      })
    );
  }, [rows, query, columns]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(() => {
    const start = safePage * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  const colCount = columns.length;

  return (
    <div className="erp-table-system">
      <div className="erp-table-toolbar">
        <input
          type="search"
          className="erp-table-search"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          aria-label={t("ui.search")}
        />
        <span className="erp-table-meta">
          {formatNumber(filtered.length)}{" "}
          {filtered.length !== 1 ? t("ui.rows") : t("ui.row")}
        </span>
      </div>
      <div className="erp-table-wrap erp-table-wrap--sticky">
        <table className="erp-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={
                    c.numeric || c.align === "right"
                      ? "erp-table-num"
                      : undefined
                  }
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && showSkeleton ? (
              <>
                <TableRowSkeleton colCount={colCount} />
                <TableRowSkeleton colCount={colCount} />
                <TableRowSkeleton colCount={colCount} />
              </>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="erp-table-empty">
                  <div className="erp-empty-state">
                    <span className="erp-empty-state__icon" aria-hidden />
                    <p className="erp-empty-state__title">{emptyTitle}</p>
                    <p className="erp-empty-state__hint">{emptyHint}</p>
                  </div>
                </td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr key={getRowId(row)}>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={
                        c.clip !== false
                          ? `erp-cell-clip ${c.numeric || c.align === "right" ? "erp-table-num" : ""}`
                          : c.numeric || c.align === "right"
                            ? "erp-table-num"
                            : undefined
                      }
                      title={
                        c.titleAccessor
                          ? String(c.titleAccessor(row) || "")
                          : undefined
                      }
                    >
                      {c.render
                        ? c.render(row)
                        : formatCell(row[c.key], c.numeric)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && !loading ? (
        <div className="erp-table-pagination">
          <button
            type="button"
            className="erp-btn erp-btn-ghost erp-btn-sm"
            disabled={safePage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            {t("ui.previous")}
          </button>
          <span className="erp-table-pagination__status">
            {t("ui.page")} {safePage + 1} / {pageCount}
          </span>
          <button
            type="button"
            className="erp-btn erp-btn-ghost erp-btn-sm"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            {t("ui.next")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function formatCell(value, numeric) {
  if (numeric) return formatNumber(value);
  return safeText(value, "—");
}

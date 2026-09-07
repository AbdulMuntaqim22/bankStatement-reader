import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import { downloadCsv, downloadJson } from "./export/download";
import {
  dateRange,
  filterByTitle,
  groupTotals,
  groupTransactions,
} from "./group/credits";
import { detectBank } from "./parse/detectBank";
import { parseTable } from "./parse/table";
import type { Transaction, TxFilter, TxGroup } from "./parse/types";

type Status =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "needs_pin"; message: string }
  | { kind: "wrong_pin"; message: string }
  | { kind: "error"; message: string }
  | { kind: "success" };

type SortCol = "title" | "type" | "date" | "count" | "total";
type SortDir = "asc" | "desc";

const pkr = new Intl.NumberFormat("en-PK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const FILTERS: Array<{ id: TxFilter; label: string }> = [
  { id: "credit", label: "Credits" },
  { id: "debit", label: "Debits" },
  { id: "all", label: "Both" },
];

const HEADINGS: Record<TxFilter, string> = {
  credit: "Incoming credits",
  debit: "Outgoing debits",
  all: "All transactions",
};

function rowKey(group: TxGroup): string {
  return `${group.type}-${group.title}`;
}

/** Convert dd/mm/yyyy → sortable integer yyyymmdd */
function parseSortDate(date: string): number {
  const m = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? Number(`${m[3]}${m[2]}${m[1]}`) : 0;
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [bank, setBank] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<TxFilter>("credit");
  const [titleQuery, setTitleQuery] = useState("");
  const [pageCount, setPageCount] = useState(0);

  // --- selection state ---
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set());

  // --- sort state (default: date descending = most recent first) ---
  const [sortCol, setSortCol] = useState<SortCol>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // --- right-panel drag-resize ---
  const [selPanelWidth, setSelPanelWidth] = useState(380);
  const [isResizing, setIsResizing] = useState(false);
  const resizeDrag = useRef<{ startX: number; startWidth: number } | null>(null);

  // ── Derived data ──────────────────────────────────────────────

  const allGroups = useMemo(
    () =>
      groupTransactions(transactions, filter).filter(
        (g) => !removedKeys.has(rowKey(g)),
      ),
    [transactions, filter, removedKeys],
  );

  const groups = useMemo(
    () => filterByTitle(allGroups, titleQuery),
    [allGroups, titleQuery],
  );

  const totals = groupTotals(groups);
  const hidden = allGroups.length - groups.length;

  const sortedGroups = useMemo(() => {
    const sorted = [...groups];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "type":
          cmp = a.type.localeCompare(b.type);
          break;
        case "date":
          // sort by the latest transaction date in the group
          cmp = parseSortDate(a.lastDate) - parseSortDate(b.lastDate);
          break;
        case "count":
          cmp = a.count - b.count;
          break;
        case "total":
          cmp = a.total - b.total;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [groups, sortCol, sortDir]);

  const selectedGroups = useMemo(
    () => allGroups.filter((g) => selectedKeys.has(rowKey(g))),
    [allGroups, selectedKeys],
  );
  const selectionTotals = groupTotals(selectedGroups);

  const pinRequired =
    status.kind === "needs_pin" || status.kind === "wrong_pin";

  // ── Actions ───────────────────────────────────────────────────

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      // numeric / date columns default to descending; text columns ascending
      setSortDir(col === "date" || col === "total" || col === "count" ? "desc" : "asc");
    }
  }

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizeDrag.current = { startX: e.clientX, startWidth: selPanelWidth };
      setIsResizing(true);

      function onMouseMove(ev: MouseEvent) {
        if (!resizeDrag.current) return;
        // dragging handle left → selection panel grows
        const delta = resizeDrag.current.startX - ev.clientX;
        const w = Math.max(220, Math.min(720, resizeDrag.current.startWidth + delta));
        setSelPanelWidth(w);
      }

      function onMouseUp() {
        resizeDrag.current = null;
        setIsResizing(false);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      }

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [selPanelWidth],
  );

  function toggleRowKey(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function handleRemoveSelected() {
    setRemovedKeys((prev) => new Set([...prev, ...selectedKeys]));
    setSelectedKeys(new Set());
  }

  function handleClearSelection() {
    setSelectedKeys(new Set());
  }

  async function parseBuffer(data: ArrayBuffer, nextPin: string) {
    setStatus({ kind: "parsing" });
    setTransactions([]);
    setBank(null);
    setSelectedKeys(new Set());
    setRemovedKeys(new Set());
    setSortCol("date");
    setSortDir("desc");

    const { extractPdf } = await import("./extract/pdf");
    const extracted = await extractPdf(data, nextPin);
    if (!extracted.ok) {
      if (extracted.reason === "needs_pin") {
        setStatus({ kind: "needs_pin", message: extracted.message });
        queueMicrotask(() => pinInputRef.current?.focus());
        return;
      }
      if (extracted.reason === "wrong_pin") {
        setStatus({ kind: "wrong_pin", message: extracted.message });
        queueMicrotask(() => pinInputRef.current?.focus());
        return;
      }
      setStatus({ kind: "error", message: extracted.message });
      return;
    }

    const detected = detectBank(extracted.items);
    const parsed = parseTable(extracted.items);
    setBank(detected);
    setPageCount(extracted.pageCount);
    setTransactions(parsed);

    if (parsed.length === 0) {
      setStatus({
        kind: "error",
        message:
          "Could not find a transaction table in this PDF. Digitally generated Pakistani statements work best.",
      });
      return;
    }

    setStatus({ kind: "success" });
  }

  async function loadFile(file: File) {
    if (file.type && file.type !== "application/pdf") {
      setStatus({ kind: "error", message: "Please choose a PDF bank statement." });
      return;
    }
    const data = await file.arrayBuffer();
    setFileName(file.name);
    setBuffer(data);
    await parseBuffer(data, pin);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      void loadFile(file);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!buffer) {
      fileInputRef.current?.click();
      return;
    }
    void parseBuffer(buffer, pin);
  }

  // ── Sort-header helper ─────────────────────────────────────────

  function SortTh({
    col,
    className,
    children,
  }: {
    col: SortCol;
    className?: string;
    children: React.ReactNode;
  }) {
    const active = sortCol === col;
    return (
      <th
        className={[
          "sortable",
          active ? "sort-active" : "",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => toggleSort(col)}
      >
        {children}
        {active && (
          <span className="sort-icon">{sortDir === "asc" ? " ↑" : " ↓"}</span>
        )}
      </th>
    );
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className={`app-shell${isResizing ? " resizing" : ""}`}>
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <p className="eyebrow">Local · no upload · no server</p>
          <h1>Statement Totals</h1>
        </div>

        <form className="sidebar-form" onSubmit={onSubmit}>
          <label
            className={dragging ? "dropzone dragging" : "dropzone"}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void loadFile(file);
                }
              }}
            />
            <strong>{fileName || "Drop a statement PDF here"}</strong>
            <span>or click to choose a file</span>
          </label>

          <div className="pin-row">
            <label className="pin-field" htmlFor="pin">
              PIN (optional)
              <input
                id="pin"
                ref={pinInputRef}
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                placeholder="Leave blank if unlocked"
                onChange={(event) => setPin(event.target.value)}
              />
            </label>
          </div>

          <div className="sidebar-btn-row">
            <button
              type="button"
              className="ghost pin-toggle"
              onClick={() => setShowPin((v) => !v)}
            >
              {showPin ? "Hide PIN" : "Show PIN"}
            </button>
            <button
              type="submit"
              className="primary read-btn"
              disabled={status.kind === "parsing"}
            >
              {pinRequired ? "Unlock & read" : "Read statement"}
            </button>
          </div>

          <p className={`status status-${status.kind}`} role="status">
            {status.kind === "idle" &&
              "Drop a PDF. If PIN-protected, enter the PIN and read again — no re-upload needed."}
            {status.kind === "parsing" && "Reading the statement…"}
            {status.kind === "needs_pin" && status.message}
            {status.kind === "wrong_pin" && status.message}
            {status.kind === "error" && status.message}
            {status.kind === "success" &&
              `${transactions.length} transaction${transactions.length === 1 ? "" : "s"} read${bank ? ` · ${bank}` : ""}${pageCount ? ` · ${pageCount} page${pageCount === 1 ? "" : "s"}` : ""}.`}
          </p>
        </form>

        <p className="sidebar-lede">
          Transactions with the same title are grouped and summed. The file and
          PIN never leave this device.
        </p>
      </aside>

      {/* ── Main content ─────────────────────────────────────── */}
      <main className="main-content">
        {status.kind !== "success" && (
          <div className="main-empty">
            {status.kind === "idle" ? "Load a statement PDF to get started." : ""}
          </div>
        )}

        <div className="tables-row">
          {status.kind === "success" && (
            <section className="results">
              <div className="results-bar">
                <div>
                  <h2>{HEADINGS[filter]}</h2>
                  <p>
                    {`${groups.length} title${groups.length === 1 ? "" : "s"} · ${totals.count} transaction${totals.count === 1 ? "" : "s"} · ${pkr.format(totals.total)}`}
                    {hidden > 0 ? ` · ${hidden} hidden by title filter` : ""}
                  </p>
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => downloadCsv(groups, `statement-${filter}.csv`)}
                  >
                    Download CSV
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => downloadJson(groups, `statement-${filter}.json`)}
                  >
                    Download JSON
                  </button>
                </div>
              </div>

              <div className="filters">
                <div className="chips" role="group" aria-label="Transaction type">
                  {FILTERS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={option.id === filter ? "chip selected" : "chip"}
                      aria-pressed={option.id === filter}
                      onClick={() => setFilter(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="search">
                  <input
                    type="search"
                    value={titleQuery}
                    aria-label="Filter by title"
                    placeholder="Filter by title…"
                    onChange={(event) => setTitleQuery(event.target.value)}
                  />
                  {titleQuery && (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setTitleQuery("")}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <p className="select-hint">
                Hold <kbd>Ctrl</kbd> and click a row to select it. Click a column header to sort.
              </p>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <SortTh col="title">Title</SortTh>
                      <SortTh col="type">Type</SortTh>
                      <SortTh col="date">Date</SortTh>
                      <SortTh col="count" className="num">Count</SortTh>
                      <SortTh col="total" className="num">Total</SortTh>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedGroups.length === 0 ? (
                      <tr>
                        <td colSpan={5}>
                          {titleQuery
                            ? `No titles match "${titleQuery}".`
                            : "No matching transactions were found."}
                        </td>
                      </tr>
                    ) : (
                      sortedGroups.map((group) => {
                        const key = rowKey(group);
                        const isSelected = selectedKeys.has(key);
                        return (
                          <tr
                            key={key}
                            className={isSelected ? "row-selected" : undefined}
                            onClick={(event) => {
                              if (event.ctrlKey || event.metaKey) {
                                toggleRowKey(key);
                              }
                            }}
                            aria-selected={isSelected}
                          >
                            <td>{group.title}</td>
                            <td>
                              <span className={`tag tag-${group.type}`}>
                                {group.type === "credit" ? "Credit" : "Debit"}
                              </span>
                            </td>
                            <td className="date">{dateRange(group)}</td>
                            <td className="num">{group.count}</td>
                            <td className="num">{pkr.format(group.total)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={3}>Total</th>
                      <th className="num">{totals.count}</th>
                      <th className="num">{pkr.format(totals.total)}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {selectedKeys.size > 0 && (
                <div className="selection-actions">
                  <span className="selection-count">
                    {selectedKeys.size} row{selectedKeys.size > 1 ? "s" : ""} selected
                  </span>
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={handleRemoveSelected}
                  >
                    Remove selected from table
                  </button>
                </div>
              )}
            </section>
          )}

          {/* Drag handle — only visible when selection panel is open */}
          {selectedGroups.length > 0 && status.kind === "success" && (
            <div
              className="panel-resize-handle"
              onMouseDown={onResizeMouseDown}
              title="Drag to resize"
            />
          )}

          {selectedGroups.length > 0 && (
            <section
              className="selection-section"
              style={{ width: selPanelWidth, flex: "none" }}
            >
              <div className="results-bar">
                <div>
                  <h2>Selected rows</h2>
                  <p>
                    {`${selectedGroups.length} title${selectedGroups.length === 1 ? "" : "s"} · ${selectionTotals.count} transaction${selectionTotals.count === 1 ? "" : "s"} · ${pkr.format(selectionTotals.total)}`}
                  </p>
                </div>
                <button
                  type="button"
                  className="ghost"
                  onClick={handleClearSelection}
                >
                  Clear
                </button>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Type</th>
                      <th>Date</th>
                      <th className="num">Count</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedGroups.map((group) => (
                      <tr key={rowKey(group)}>
                        <td>{group.title}</td>
                        <td>
                          <span className={`tag tag-${group.type}`}>
                            {group.type === "credit" ? "Credit" : "Debit"}
                          </span>
                        </td>
                        <td className="date">{dateRange(group)}</td>
                        <td className="num">{group.count}</td>
                        <td className="num">{pkr.format(group.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={3}>Sum of selected</th>
                      <th className="num">{selectionTotals.count}</th>
                      <th className="num">{pkr.format(selectionTotals.total)}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

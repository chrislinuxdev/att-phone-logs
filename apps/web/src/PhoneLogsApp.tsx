import { useEffect, useMemo, useRef, useState } from "react";

type ServiceType = "VOICE" | "TEXT";
type PhoneLogRow = Record<string, string | number | boolean>;

interface PhoneLogFileMetadata {
  id: string;
  fileName: string;
  displayName: string;
  serviceType: ServiceType;
  serviceLabel: string;
  lineNumber: string;
  lineDisplay: string;
  recordCount: number;
}

interface AggregateOption {
  id: string;
  label: string;
  serviceType: ServiceType;
  lineNumber: string;
  lineDisplay: string;
}

interface PhoneLogOptions {
  files: PhoneLogFileMetadata[];
  aggregateOptions: AggregateOption[];
}

interface ColumnFilterOption {
  value: string;
  label: string;
}

interface PhoneLogView {
  id: string;
  fileName: string;
  displayName: string;
  serviceType: ServiceType;
  serviceLabel: string;
  lineNumber: string;
  lineDisplay: string;
  columns: string[];
  rows: PhoneLogRow[];
  recordCount: number;
  columnFilterOptions: Record<string, ColumnFilterOption[]>;
}

interface RetrievalJob {
  id: string;
  status: "running" | "waiting_for_confirmation_code" | "completed" | "failed";
  message: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
  result?: {
    filesWritten: string[];
    rowsWritten: number;
  };
}

type SortState = {
  column: string;
  key: string;
  direction: "asc" | "desc";
};

const blankFilterValue = "__BLANK__";
const sortConfigByColumn: Record<string, { key: string; direction: "asc" | "desc"; title: string }> = {
  Date: { key: "dateTime", direction: "desc", title: "Sort by date/time" },
  Time: { key: "dateTime", direction: "desc", title: "Sort by date/time" },
  Number: { key: "number", direction: "asc", title: "Sort by number" },
  Nickname: { key: "nickname", direction: "asc", title: "Sort by nickname" },
};

export function PhoneLogsApp() {
  const refreshedRetrievalJobIds = useRef(new Set<string>());
  const [options, setOptions] = useState<PhoneLogOptions>({ files: [], aggregateOptions: [] });
  const [selectedId, setSelectedId] = useState("");
  const [view, setView] = useState<PhoneLogView | null>(null);
  const [retrievalJob, setRetrievalJob] = useState<RetrievalJob | null>(null);
  const [confirmationCode, setConfirmationCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [retrieving, setRetrieving] = useState(false);
  const [submittingCode, setSubmittingCode] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [incomingOnly, setIncomingOnly] = useState(false);
  const [outgoingOnly, setOutgoingOnly] = useState(false);
  const [unmatchedOnly, setUnmatchedOnly] = useState(false);
  const [shortNumbersOnly, setShortNumbersOnly] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [sortState, setSortState] = useState<SortState>({
    column: "Date",
    key: "dateTime",
    direction: "desc",
  });

  useEffect(() => {
    loadOptions()
      .catch((loadError: Error) => setError(loadError.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!retrievalJob || retrievalJob.status === "completed" || retrievalJob.status === "failed") {
      setRetrieving(false);
      return;
    }

    const interval = window.setInterval(() => {
      fetch(`/api/phone-logs/retrieve/${retrievalJob.id}`)
        .then(response => response.ok ? response.json() : Promise.reject(new Error(`Failed to load retrieval status (${response.status})`)))
        .then((job: RetrievalJob) => setRetrievalJob(job))
        .catch((loadError: Error) => setError(loadError.message));
    }, 1500);

    return () => window.clearInterval(interval);
  }, [retrievalJob?.id, retrievalJob?.status]);

  useEffect(() => {
    if (!retrievalJob || retrievalJob.status !== "completed" || refreshedRetrievalJobIds.current.has(retrievalJob.id)) {
      return;
    }

    refreshedRetrievalJobIds.current.add(retrievalJob.id);
    setRetrieving(false);
    refreshCurrentData();
  }, [retrievalJob?.id, retrievalJob?.status]);

  function loadOptions() {
    return fetch("/api/phone-logs/options")
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`Failed to load options (${response.status})`)))
      .then((data: PhoneLogOptions) => {
        setOptions(data);

        if (!selectedId) {
          setSelectedId(data.aggregateOptions.find(option => option.serviceType === "VOICE")?.id || data.files[0]?.id || "");
        }
      });
  }

  useEffect(() => {
    if (!selectedId) {
      setView(null);
      return;
    }

    const [kind, serviceType, lineNumber] = selectedId.split(":");
    const url = kind === "aggregate"
      ? `/api/phone-logs/aggregate/${serviceType}/${encodeURIComponent(lineNumber)}`
      : `/api/phone-logs/files/${encodeURIComponent(selectedId)}`;

    setLoading(true);
    fetch(url)
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`Failed to load phone log data (${response.status})`)))
      .then((data: PhoneLogView) => {
        setView(data);
        setColumnFilters(previous => pruneColumnFilters(previous, data));
      })
      .catch((loadError: Error) => setError(loadError.message))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const filteredRows = useMemo(() => {
    if (!view) {
      return [];
    }

    const normalizedSearch = normalizeSearchTerm(searchTerm);

    return view.rows.filter(row => {
      if (!matchesDirectionFilter(row, incomingOnly, outgoingOnly)) {
        return false;
      }

      if (normalizedSearch && !matchesSearchFilter(row, normalizedSearch)) {
        return false;
      }

      if (unmatchedOnly && Boolean(row["Has Nickname"])) {
        return false;
      }

      if (shortNumbersOnly && !Boolean(row["Short Number"])) {
        return false;
      }

      return matchesColumnFilters(row, view.columns, columnFilters);
    });
  }, [columnFilters, incomingOnly, outgoingOnly, searchTerm, shortNumbersOnly, unmatchedOnly, view]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((left, right) => compareRows(left, right, sortState));
  }, [filteredRows, sortState]);

  function setSort(column: string) {
    const sortConfig = sortConfigByColumn[column];

    if (!sortConfig) {
      return;
    }

    setSortState(previous => {
      if (previous.key === sortConfig.key) {
        return {
          column,
          key: sortConfig.key,
          direction: previous.direction === "asc" ? "desc" : "asc",
        };
      }

      return {
        column,
        key: sortConfig.key,
        direction: sortConfig.direction,
      };
    });
  }

  function startRetrieval() {
    setError("");
    setRetrieving(true);
    fetch("/api/phone-logs/retrieve", { method: "POST" })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`Failed to start retrieval (${response.status})`)))
      .then((job: RetrievalJob) => setRetrievalJob(job))
      .catch((startError: Error) => {
        setRetrieving(false);
        setError(startError.message);
      });
  }

  function submitConfirmationCode() {
    if (!retrievalJob) {
      return;
    }

    setSubmittingCode(true);
    fetch(`/api/phone-logs/retrieve/${retrievalJob.id}/confirmation-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: confirmationCode,
      }),
    })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`Failed to submit confirmation code (${response.status})`)))
      .then((job: RetrievalJob) => {
        setRetrievalJob(job);
        setConfirmationCode("");
      })
      .catch((submitError: Error) => setError(submitError.message))
      .finally(() => setSubmittingCode(false));
  }

  function refreshCurrentData() {
    setLoading(true);
    loadOptions()
      .then(() => {
        if (selectedId) {
          const [kind, serviceType, lineNumber] = selectedId.split(":");
          const url = kind === "aggregate"
            ? `/api/phone-logs/aggregate/${serviceType}/${encodeURIComponent(lineNumber)}`
            : `/api/phone-logs/files/${encodeURIComponent(selectedId)}`;

          return fetch(url)
            .then(response => response.ok ? response.json() : Promise.reject(new Error(`Failed to refresh phone log data (${response.status})`)))
            .then((data: PhoneLogView) => {
              setView(data);
              setColumnFilters(previous => pruneColumnFilters(previous, data));
            });
        }

        return Promise.resolve();
      })
      .catch((refreshError: Error) => setError(refreshError.message))
      .finally(() => setLoading(false));
  }

  function toggleColumnFilter(column: string, value: string, checked: boolean) {
    setColumnFilters(previous => {
      const nextValues = new Set(previous[column] || []);

      if (checked) {
        nextValues.add(value);
      } else {
        nextValues.delete(value);
      }

      const next = { ...previous };

      if (nextValues.size > 0) {
        next[column] = [...nextValues];
      } else {
        delete next[column];
      }

      return next;
    });
  }

  return (
    <main className="app-shell">
      <header className="page-header">
        <div>
          <h1>Phone Logs</h1>
          <p>{view?.lineDisplay ? `Line ${view.lineDisplay}` : "Server-backed ATT phone-log viewer"}</p>
        </div>
        <div className="header-actions">
          <button type="button" className="retrieve-button" onClick={startRetrieval} disabled={retrieving}>
            {retrieving ? "Retrieving..." : "Retrieve Phone Logs"}
          </button>
          <div className="record-count">{view ? `${sortedRows.length} ${view.serviceLabel} records` : ""}</div>
        </div>
      </header>

      {retrievalJob ? (
        <div className={`retrieval-status ${retrievalJob.status}`}>
          <strong>{retrievalJob.message}</strong>
          {retrievalJob.result ? <span>{retrievalJob.result.filesWritten.length} files written, {retrievalJob.result.rowsWritten} rows processed</span> : null}
          {retrievalJob.error ? <span>{retrievalJob.error}</span> : null}
        </div>
      ) : null}

      <section className="controls" aria-label="Phone log controls">
        <label>
          <span>Phone Log File</span>
          <select value={selectedId} onChange={event => setSelectedId(event.target.value)}>
            {options.aggregateOptions.map(option => (
              <option value={option.id} key={option.id}>{option.label}</option>
            ))}
            {options.files.map(file => (
              <option value={file.id} key={file.id}>{file.displayName}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Search Nickname or Number</span>
          <input
            type="search"
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder="Type a nickname or phone number"
          />
        </label>

        <div className="toggle-row">
          <label><input type="checkbox" checked={incomingOnly} onChange={event => setIncomingOnly(event.target.checked)} /> INCOMING only</label>
          <label><input type="checkbox" checked={outgoingOnly} onChange={event => setOutgoingOnly(event.target.checked)} /> OUTGOING only</label>
          <label><input type="checkbox" checked={unmatchedOnly} onChange={event => setUnmatchedOnly(event.target.checked)} /> No nicknames</label>
          <label><input type="checkbox" checked={shortNumbersOnly} onChange={event => setShortNumbersOnly(event.target.checked)} /> Numbers &lt; 10 digits</label>
        </div>
      </section>

      {view ? (
        <section className="column-filters" aria-label="Column filters">
          <div className="column-filters-header">
            <h2>Column Filters</h2>
            <button type="button" onClick={() => setColumnFilters({})}>Clear filters</button>
          </div>
          <div className="column-filter-grid">
            {view.columns.map(column => {
              const selectedValues = new Set(columnFilters[column] || []);
              const optionsForColumn = view.columnFilterOptions[column] || [];

              return (
                <details className="column-filter" key={column}>
                  <summary>
                    <span>{column}</span>
                    {selectedValues.size > 0 ? <span className="selected-count">{selectedValues.size} selected</span> : null}
                  </summary>
                  <div className="column-filter-options">
                    {optionsForColumn.length > 0 ? optionsForColumn.map(option => (
                      <label key={option.value}>
                        <input
                          type="checkbox"
                          checked={selectedValues.has(option.value)}
                          onChange={event => toggleColumnFilter(column, option.value, event.target.checked)}
                        />
                        {option.label}
                      </label>
                    )) : <span className="empty-filter">No values</span>}
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      ) : null}

      {error ? <div className="status error">{error}</div> : null}
      {loading ? <div className="status">Loading phone logs...</div> : null}

      {view && !loading ? (
        <section className="grid" aria-label={view.displayName}>
          <table>
            <thead>
              <tr>
                {view.columns.map(column => {
                  const sortConfig = sortConfigByColumn[column];
                  const isActive = Boolean(sortConfig && sortConfig.key === sortState.key);

                  return (
                    <th
                      key={column}
                      className={sortConfig ? `sortable ${isActive ? "active-sort" : ""}` : ""}
                      onClick={sortConfig ? () => setSort(column) : undefined}
                      aria-sort={isActive ? (sortState.direction === "asc" ? "ascending" : "descending") : "none"}
                      title={sortConfig?.title}
                      tabIndex={sortConfig ? 0 : undefined}
                      onKeyDown={event => {
                        if (sortConfig && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          setSort(column);
                        }
                      }}
                    >
                      {column}
                      {isActive ? <span className="sort-indicator">{sortState.direction === "asc" ? "^" : "v"}</span> : null}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, rowIndex) => (
                <tr key={`${row["Sort Timestamp"]}-${row.Number}-${row.Direction}-${rowIndex}`}>
                  {view.columns.map(column => (
                    <td key={column}>
                      {column === "Nickname" && Boolean(row["Nickname Overridden"]) ? (
                        <span className="nickname-override">{getCellText(row, column)}</span>
                      ) : getCellText(row, column)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {retrievalJob?.status === "waiting_for_confirmation_code" ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirmation-code-title">
            <h2 id="confirmation-code-title">AT&amp;T Confirmation Code</h2>
            <p>Enter the confirmation code from AT&amp;T to continue retrieving phone logs.</p>
            <input
              autoFocus
              value={confirmationCode}
              onChange={event => setConfirmationCode(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter" && confirmationCode.trim()) {
                  submitConfirmationCode();
                }
              }}
            />
            <div className="modal-actions">
              <button type="button" onClick={submitConfirmationCode} disabled={submittingCode || !confirmationCode.trim()}>
                {submittingCode ? "Submitting..." : "Submit Code"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function pruneColumnFilters(previous: Record<string, string[]>, view: PhoneLogView) {
  const next: Record<string, string[]> = {};

  Object.entries(previous).forEach(([column, values]) => {
    const allowed = new Set((view.columnFilterOptions[column] || []).map(option => option.value));
    const keptValues = values.filter(value => allowed.has(value));

    if (keptValues.length > 0) {
      next[column] = keptValues;
    }
  });

  return next;
}

function getCellText(row: PhoneLogRow, column: string) {
  if (column === "Nickname") {
    return String(row["Display Nickname"] ?? "");
  }

  return String(row[column] ?? "");
}

function matchesDirectionFilter(row: PhoneLogRow, incomingOnly: boolean, outgoingOnly: boolean) {
  if (incomingOnly && !outgoingOnly) {
    return String(row.Direction || "").toUpperCase() === "INCOMING";
  }

  if (outgoingOnly && !incomingOnly) {
    return String(row.Direction || "").toUpperCase() === "OUTGOING";
  }

  return true;
}

function normalizeSearchTerm(value: unknown) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchesSearchFilter(row: PhoneLogRow, searchTerm: string) {
  return [
    row.Number,
    row.Nickname,
    row["Local Nickname"],
    row["Display Nickname"],
  ]
    .map(value => normalizeSearchTerm(value))
    .join(" ")
    .includes(searchTerm);
}

function matchesColumnFilters(row: PhoneLogRow, columns: string[], columnFilters: Record<string, string[]>) {
  return columns.every(column => {
    const selectedValues = columnFilters[column];

    if (!selectedValues || selectedValues.length === 0) {
      return true;
    }

    const value = getCellText(row, column).trim();
    const key = value === "" ? blankFilterValue : value;
    return selectedValues.includes(key);
  });
}

function compareRows(left: PhoneLogRow, right: PhoneLogRow, sortState: SortState) {
  const leftPrimary = getSortValue(left, sortState.key);
  const rightPrimary = getSortValue(right, sortState.key);
  const primaryComparison = compareSortValues(leftPrimary, rightPrimary, sortState.key);

  if (primaryComparison !== 0) {
    return sortState.direction === "asc" ? primaryComparison : -primaryComparison;
  }

  const dateComparison = compareSortValues(getSortValue(left, "dateTime"), getSortValue(right, "dateTime"), "dateTime");

  if (dateComparison !== 0) {
    return -dateComparison;
  }

  const numberComparison = compareSortValues(getSortValue(left, "number"), getSortValue(right, "number"), "number");

  if (numberComparison !== 0) {
    return numberComparison;
  }

  return compareSortValues(getSortValue(left, "nickname"), getSortValue(right, "nickname"), "nickname");
}

function getSortValue(row: PhoneLogRow, column: string) {
  if (column === "Date" || column === "Time" || column === "dateTime") {
    return Number(row["Sort Timestamp"] || 0);
  }

  if (column === "Number" || column === "number") {
    return String(row["Normalized Number"] || "");
  }

  if (column === "Nickname" || column === "nickname") {
    return String(row["Display Nickname"] || "").trim().toLowerCase();
  }

  return String(row[column] ?? "").trim().toLowerCase();
}

function compareSortValues(left: string | number, right: string | number, column: string) {
  if (column === "dateTime") {
    return Number(left) - Number(right);
  }

  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
}

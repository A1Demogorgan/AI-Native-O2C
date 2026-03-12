"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReviewAgentResult } from "@/lib/types";
import StatusExpandableCard from "@/components/status-expandable-card";

type Column = {
  key: string;
  label: string;
};

type ActionOption = {
  label: string;
  decision: string;
  secondary?: boolean;
};

type Props = {
  title: string;
  queueLabel: string;
  sourceEndpoint: string;
  runEndpoint: string;
  actionEndpoint: string;
  idField: string;
  columns: Column[];
  runButtonLabel: string;
  actionOptions: (result: ReviewAgentResult) => ActionOption[];
  requestBody?: (row: Record<string, unknown>) => Record<string, unknown>;
  actionBody?: (result: ReviewAgentResult, decision: string) => Record<string, unknown>;
  resultTitle?: (result: ReviewAgentResult & { action_status?: string; final_decision?: string }) => string;
  resultSubtitle?: (result: ReviewAgentResult & { action_status?: string; final_decision?: string }) => string | undefined;
  resultTone?: (result: ReviewAgentResult & { action_status?: string; final_decision?: string }) => "red" | "amber" | "green";
};

function asCell(value: unknown) {
  if (value === null || value === undefined) return "--";
  if (typeof value === "number") return value.toFixed(2);
  return humanizeValue(value);
}

function humanizeValue(value: unknown) {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

type ResultWithStatus = ReviewAgentResult & {
  action_status?: string;
  final_decision?: string;
};

async function readQueueResponse(res: Response): Promise<Record<string, unknown>[]> {
  const data = (await res.json().catch(() => ({}))) as { error?: string } | Record<string, unknown>[];
  if (!res.ok) {
    const message = Array.isArray(data) ? "Failed to load queue." : data.error ?? "Failed to load queue.";
    throw new Error(message);
  }
  return Array.isArray(data) ? data : [];
}

export default function SequentialReviewWorkspace({
  title,
  queueLabel,
  sourceEndpoint,
  runEndpoint,
  actionEndpoint,
  idField,
  columns,
  runButtonLabel,
  actionOptions,
  requestBody,
  actionBody,
  resultTitle,
  resultSubtitle,
  resultTone,
}: Props) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [results, setResults] = useState<ResultWithStatus[]>([]);
  const [busyRun, setBusyRun] = useState(false);
  const [runProgress, setRunProgress] = useState<{ done: number; total: number; current: string }>({
    done: 0,
    total: 0,
    current: "",
  });
  const [cancelRunRequested, setCancelRunRequested] = useState(false);
  const cancelRunRef = useRef(false);
  const [busyActionFor, setBusyActionFor] = useState<string>("");
  const [err, setErr] = useState("");
  const [openCardId, setOpenCardId] = useState<string>("");

  async function loadRows() {
    const res = await fetch(sourceEndpoint);
    const data = await readQueueResponse(res);
    setRows(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    let cancelled = false;
    fetch(sourceEndpoint)
      .then(readQueueResponse)
      .then((data: Record<string, unknown>[]) => {
        if (!cancelled) {
          setErr("");
          setRows(Array.isArray(data) ? data : []);
        }
      })
      .catch((loadErr: unknown) => {
        if (!cancelled) {
          setRows([]);
          setErr(loadErr instanceof Error ? loadErr.message : "Failed to load queue.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sourceEndpoint]);

  async function runAgent() {
    setErr("");
    setBusyRun(true);
    setCancelRunRequested(false);
    cancelRunRef.current = false;
    setResults([]);
    setRunProgress({ done: 0, total: rows.length, current: "" });

    const next: ResultWithStatus[] = [];
    for (let i = 0; i < rows.length; i += 1) {
      if (cancelRunRef.current) {
        break;
      }
      const row = rows[i];
      const subjectId = String(row[idField] ?? "");
      setRunProgress({ done: i, total: rows.length, current: subjectId });
      const res = await fetch(runEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody ? requestBody(row) : { [idField]: subjectId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; review?: ReviewAgentResult };
      if (!res.ok || !data.review) {
        setErr(data.error ?? `Agent run failed for ${subjectId}`);
        continue;
      }
      next.push(data.review);
      setResults([...next]);
    }

    setRunProgress((prev) => ({ ...prev, done: next.length, current: "" }));
    setBusyRun(false);
  }

  async function applyAction(result: ResultWithStatus, decision: string) {
    setErr("");
    setBusyActionFor(result.subject_id);
    const res = await fetch(actionEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        actionBody
          ? actionBody(result, decision)
          : {
              [idField]: result.subject_id,
              final_decision: decision,
              proposal: result.payload,
            },
      ),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setErr(data.error ?? "Failed to apply action.");
      setBusyActionFor("");
      return;
    }

    setResults((prev) =>
      prev.map((item) =>
        item.subject_id === result.subject_id
          ? {
              ...item,
              action_status: decision,
              final_decision: decision,
            }
          : item,
      ),
    );
    setBusyActionFor("");
    loadRows();
  }

  const queueCount = useMemo(() => rows.length, [rows]);

  return (
    <section>
      {err && <div className="card" style={{ borderColor: "#e5a5a5" }}>{err}</div>}

      <div className="card">
        <div className="row-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="label">{queueLabel}</div>
            <div className="value">{queueCount}</div>
            {busyRun && (
              <p className="muted-note" style={{ margin: "6px 0 0" }}>
                Processed {runProgress.done}/{runProgress.total}
                {runProgress.current ? ` | Running: ${runProgress.current}` : ""}
                {cancelRunRequested ? " | Stopping after current record..." : ""}
              </p>
            )}
          </div>
          <div className="row-actions">
            <button onClick={runAgent} disabled={busyRun}>
              {busyRun ? `${title} running...` : runButtonLabel}
            </button>
            {busyRun && (
              <button
                className="secondary"
                onClick={() => {
                  setCancelRunRequested(true);
                  cancelRunRef.current = true;
                }}
              >
                Stop
              </button>
            )}
          </div>
        </div>
      </div>

      <StatusExpandableCard
        title={`${queueLabel} (${rows.length})`}
        tone={rows.length > 0 ? "amber" : "green"}
        open={openCardId === "queue"}
        onToggle={() => setOpenCardId((prev) => (prev === "queue" ? "" : "queue"))}
        style={{ marginTop: 12 }}
      >
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row[idField] ?? "")}>
                  {columns.map((column) => (
                    <td key={column.key}>{asCell(row[column.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StatusExpandableCard>

      {results.length > 0 && (
        <div className="status-panel-grid" style={{ marginTop: 12 }}>
          {results.map((result) => (
            <StatusExpandableCard
              key={result.subject_id}
              title={
                resultTitle
                  ? resultTitle(result)
                  : `${result.subject_id} | Recommendation: ${humanizeValue(result.recommended_decision)}${result.final_decision ? ` | Action: ${humanizeValue(result.final_decision)}` : ""}`
              }
              subtitle={resultSubtitle ? resultSubtitle(result) : undefined}
              tone={resultTone ? resultTone(result) : resolveTone(result)}
              open={openCardId === result.subject_id}
              onToggle={() => setOpenCardId((prev) => (prev === result.subject_id ? "" : result.subject_id))}
              compact
            >
              <div style={{ marginTop: 10 }}>
                <div className="label">{result.action_title}</div>
                <p style={{ margin: "6px 0 0" }}>{result.action_summary}</p>
              </div>

              <div className="table-wrap" style={{ marginTop: 10 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Fact</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.facts.map((fact, idx) => (
                      <tr key={`${result.subject_id}-${idx}`}>
                        <td>{fact.label}</td>
                        <td>{humanizeValue(fact.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {result.insights.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div className="label">Insights</div>
                  {result.insights.map((insight, idx) => (
                    <p key={`${result.subject_id}-insight-${idx}`} style={{ margin: "4px 0" }}>{insight}</p>
                  ))}
                </div>
              )}

              <div className="row-actions" style={{ marginTop: 12 }}>
                {actionOptions(result).map((option, idx) => (
                  <button
                    key={`${result.subject_id}-${option.decision}-${idx}`}
                    className={option.secondary ? "secondary" : undefined}
                    onClick={() => applyAction(result, option.decision)}
                    disabled={busyActionFor === result.subject_id}
                  >
                    {busyActionFor === result.subject_id ? "Applying..." : option.label}
                  </button>
                ))}
              </div>
            </StatusExpandableCard>
          ))}
        </div>
      )}
    </section>
  );
}

function resolveTone(result: ResultWithStatus): "red" | "amber" | "green" {
  const decision = (result.final_decision ?? result.recommended_decision).toLowerCase();
  if (decision.includes("quality")) {
    return "red";
  }
  if (decision.includes("pricing") || decision.includes("short_ship")) {
    return "amber";
  }
  if (decision.includes("delivery")) {
    return "green";
  }
  if (decision.includes("call") || decision.includes("phone")) {
    return "red";
  }
  if (decision.includes("email")) {
    return "amber";
  }
  if (decision.includes("portal")) {
    return "green";
  }
  if (decision.includes("escalate") || decision.includes("block") || decision.includes("hold") || decision.includes("review")) {
    return "red";
  }
  if (decision.includes("partial") || decision.includes("split") || decision.includes("variance") || decision.includes("medium")) {
    return "amber";
  }
  return "green";
}

"use client";

import { useCallback, useEffect, useState } from "react";

type WorkflowActionRow = {
  action_id: string;
  subject_id: string;
  recommended_decision: string;
  final_decision: string;
  summary: string;
  payload_json: string;
  created_at: string;
};

type Column = {
  key: string;
  label: string;
};

type Props = {
  title: string;
  agentId: string;
  sourceEndpoint: string;
  runEndpoint: string;
  idField: string;
  columns: Column[];
  requestBody?: (row: Record<string, unknown>) => Record<string, unknown>;
};

function asCell(value: unknown) {
  if (value === null || value === undefined) return "--";
  if (typeof value === "number") return value.toFixed(2);
  return String(value);
}

export default function WorkflowAgentWorkspace({
  title,
  agentId,
  sourceEndpoint,
  runEndpoint,
  idField,
  columns,
  requestBody,
}: Props) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [history, setHistory] = useState<WorkflowActionRow[]>([]);
  const [busyId, setBusyId] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const [rowsRes, historyRes] = await Promise.all([
      fetch(sourceEndpoint),
      fetch(`/api/agents/workflow-actions?agent_id=${encodeURIComponent(agentId)}`),
    ]);

    const [nextRows, nextHistory] = await Promise.all([
      rowsRes.json() as Promise<Record<string, unknown>[]>,
      historyRes.json() as Promise<WorkflowActionRow[]>,
    ]);

    setRows(Array.isArray(nextRows) ? nextRows : []);
    setHistory(Array.isArray(nextHistory) ? nextHistory : []);
  }, [agentId, sourceEndpoint]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const run = async () => {
        await load();
      };
      void run().catch((loadErr: unknown) => {
        setErr(loadErr instanceof Error ? loadErr.message : "Failed to load agent workspace.");
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function runFor(row: Record<string, unknown>) {
    const subjectId = String(row[idField] ?? "");
    if (!subjectId) return;
    setErr("");
    setBusyId(subjectId);
    const res = await fetch(runEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody ? requestBody(row) : { [idField]: subjectId }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setErr(data.error ?? "Failed to run workflow agent.");
      setBusyId("");
      return;
    }
    setBusyId("");
    void load();
  }

  return (
    <section>
      {err && <div className="card" style={{ borderColor: "#e5a5a5" }}>{err}</div>}

      <div className="card">
        <div className="label">{title}</div>
        <div className="value">{rows.length}</div>
      </div>

      <details className="card accordion-card" style={{ marginTop: 12 }}>
        <summary>Source Queue ({rows.length})</summary>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const subjectId = String(row[idField] ?? "");
                return (
                  <tr key={subjectId}>
                    {columns.map((column) => (
                      <td key={column.key}>{asCell(row[column.key])}</td>
                    ))}
                    <td>
                      <button onClick={() => runFor(row)} disabled={busyId === subjectId}>
                        {busyId === subjectId ? "Running..." : "Run"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>

      <details className="card accordion-card" style={{ marginTop: 12 }}>
        <summary>Saved Actions ({history.length})</summary>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Recommended</th>
                <th>Final</th>
                <th>Summary</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.action_id}>
                  <td>{item.subject_id}</td>
                  <td>{item.recommended_decision}</td>
                  <td>{item.final_decision}</td>
                  <td>{item.summary}</td>
                  <td>{item.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

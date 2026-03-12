"use client";

import { useEffect, useState } from "react";

type Recommendation = {
  work_item_type: string;
  entity_id: string;
  next_agent: string;
  priority: string;
  summary: string;
};

type WorkflowActionRow = {
  action_id: string;
  subject_id: string;
  recommended_decision: string;
  final_decision: string;
  summary: string;
  created_at: string;
};

export default function OrchestratorWorkspace() {
  const [liveRows, setLiveRows] = useState<Recommendation[]>([]);
  const [history, setHistory] = useState<WorkflowActionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function loadHistory() {
    const res = await fetch("/api/agents/workflow-actions?agent_id=o2c-orchestrator");
    const rows = (await res.json()) as WorkflowActionRow[];
    setHistory(Array.isArray(rows) ? rows : []);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadHistory().catch((loadErr: unknown) => {
        setErr(loadErr instanceof Error ? loadErr.message : "Failed to load orchestrator workspace.");
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function runAgent() {
    setErr("");
    setBusy(true);
    const res = await fetch("/api/agents/o2c-orchestrator");
    const data = (await res.json().catch(() => ({}))) as { error?: string; recommendations?: Recommendation[] };
    if (!res.ok) {
      setErr(data.error ?? "Failed to run orchestrator agent.");
      setBusy(false);
      return;
    }
    setLiveRows(data.recommendations ?? []);
    setBusy(false);
    void loadHistory();
  }

  return (
    <section>
      {err && <div className="card" style={{ borderColor: "#e5a5a5" }}>{err}</div>}

      <div className="card">
        <div className="row-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="label">Orchestrator Recommendations</div>
            <div className="value">{history.length}</div>
          </div>
          <button onClick={runAgent} disabled={busy}>
            {busy ? "Running..." : "Run Agent"}
          </button>
        </div>
      </div>

      {liveRows.length > 0 && (
        <details className="card accordion-card" style={{ marginTop: 12 }} open>
          <summary>Latest Run ({liveRows.length})</summary>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Entity</th>
                  <th>Next Agent</th>
                  <th>Priority</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {liveRows.map((item, idx) => (
                  <tr key={`${item.entity_id}-${idx}`}>
                    <td>{item.work_item_type}</td>
                    <td>{item.entity_id}</td>
                    <td>{item.next_agent}</td>
                    <td>{item.priority}</td>
                    <td>{item.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <details className="card accordion-card" style={{ marginTop: 12 }}>
        <summary>Saved Routing Actions ({history.length})</summary>
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

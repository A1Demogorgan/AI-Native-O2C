"use client";

import { useCallback, useEffect, useState } from "react";

type InsightRow = {
  insight_id: string;
  insight_type: string;
  subject_id: string;
  severity: string;
  title: string;
  summary: string;
  created_at: string;
};

type Props = {
  title: string;
  agentId: string;
  runEndpoint: string;
  resultKey: string;
};

export default function InsightAgentWorkspace({ title, agentId, runEndpoint, resultKey }: Props) {
  const [liveRows, setLiveRows] = useState<Record<string, unknown>[]>([]);
  const [history, setHistory] = useState<InsightRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const loadHistory = useCallback(async () => {
    const res = await fetch(`/api/agents/insights?agent_id=${encodeURIComponent(agentId)}`);
    const rows = (await res.json()) as InsightRow[];
    setHistory(Array.isArray(rows) ? rows : []);
  }, [agentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const run = async () => {
        await loadHistory();
      };
      void run().catch((loadErr: unknown) => {
        setErr(loadErr instanceof Error ? loadErr.message : "Failed to load insight workspace.");
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadHistory]);

  async function runAgent() {
    setErr("");
    setBusy(true);
    const res = await fetch(runEndpoint);
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      setErr(String(data.error ?? "Failed to run insight agent."));
      setBusy(false);
      return;
    }
    const rows = data[resultKey];
    setLiveRows(Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []);
    setBusy(false);
    void loadHistory();
  }

  return (
    <section>
      {err && <div className="card" style={{ borderColor: "#e5a5a5" }}>{err}</div>}

      <div className="card">
        <div className="row-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="label">{title}</div>
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
          <div style={{ marginTop: 8 }}>
            {liveRows.map((row, idx) => (
              <div key={idx} className="card" style={{ marginTop: idx === 0 ? 0 : 8 }}>
                <div className="label">{String(row.title ?? row.bottleneck_stage ?? row.control_area ?? row.next_agent ?? "Insight")}</div>
                <p style={{ margin: "6px 0 0" }}>{String(row.summary ?? row.recommendation ?? "")}</p>
              </div>
            ))}
          </div>
        </details>
      )}

      <details className="card accordion-card" style={{ marginTop: 12 }}>
        <summary>Saved Insights ({history.length})</summary>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Severity</th>
                <th>Title</th>
                <th>Summary</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.insight_id}>
                  <td>{item.insight_type}</td>
                  <td>{item.severity}</td>
                  <td>{item.title}</td>
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

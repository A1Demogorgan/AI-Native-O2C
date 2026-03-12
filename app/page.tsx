"use client";

import { useEffect, useMemo, useState } from "react";
import type { AgentKpiMetric, AgentKpiSummary } from "@/lib/types";

type DashboardResponse = {
  as_of: string;
  agents: AgentKpiSummary[];
};

function fmt(metric: AgentKpiMetric) {
  if (metric.value === null) return "--";
  if (metric.unit === "percent") return `${(metric.value * 100).toFixed(1)}%`;
  if (metric.unit === "currency") return `$${metric.value.toFixed(2)}`;
  if (metric.unit === "days") return `${metric.value.toFixed(1)} days`;
  if (metric.unit === "minutes") return `${metric.value.toFixed(1)} mins`;
  return `${metric.value.toFixed(2)}`;
}

export default function DashboardPage() {
  const [payload, setPayload] = useState<DashboardResponse>({ as_of: "", agents: [] });
  const [selectedAgent, setSelectedAgent] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/agents/kpis")
      .then((res) => res.json())
      .then((data: DashboardResponse) => {
        if (!cancelled) {
          setPayload(data);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    if (selectedAgent === "all") return payload.agents;
    return payload.agents.filter((agent) => agent.agent_id === selectedAgent);
  }, [payload.agents, selectedAgent]);

  return (
    <section>
      <h2>O2C Multi-Agent Control Tower</h2>
      <p>Filter by agent to view KPI coverage and execution maturity across the order-to-cash chain.</p>

      <div className="card" style={{ marginBottom: 12 }}>
        <label htmlFor="agent-select" className="label" style={{ display: "block", marginBottom: 8 }}>
          Agent View
        </label>
        <select id="agent-select" value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)}>
          <option value="all">All agents</option>
          {payload.agents.map((agent) => (
            <option key={agent.agent_id} value={agent.agent_id}>
              {agent.agent_name}
            </option>
          ))}
        </select>
        {payload.as_of && <p style={{ marginTop: 10, marginBottom: 0 }}>As of: {new Date(payload.as_of).toLocaleString()}</p>}
      </div>

      <div className="agent-grid">
        {visible.map((agent) => (
          <article key={agent.agent_id} className="card">
            <div className="agent-header">
              <h3>{agent.agent_name}</h3>
              <span className={`pill ${agent.stage === "implemented" ? "ok" : "planned"}`}>{agent.stage}</span>
            </div>
            <div className="grid-3">
              {agent.kpis.map((metric) => (
                <div key={metric.key} className="metric-box">
                  <div className="label">{metric.label}</div>
                  <div className="value">{fmt(metric)}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              <div className="label">Primary responsibilities</div>
              <p>{agent.primary_responsibilities.join("; ")}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

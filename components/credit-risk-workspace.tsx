"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CreditRiskAssessment, CreditRiskDecision, ValidatedOrder } from "@/lib/types";
import StatusExpandableCard from "@/components/status-expandable-card";

type AssessmentWithAction = CreditRiskAssessment & {
  action_status?: "accepted" | "overridden" | "escalated";
  final_decision?: "approve" | "conditional" | "hold" | "escalate";
  override_reason?: string;
};

export default function CreditRiskWorkspace() {
  const [orders, setOrders] = useState<ValidatedOrder[]>([]);
  const [assessments, setAssessments] = useState<AssessmentWithAction[]>([]);
  const [busyRun, setBusyRun] = useState(false);
  const [runProgress, setRunProgress] = useState<{ done: number; total: number; current: string }>({
    done: 0,
    total: 0,
    current: "",
  });
  const [cancelRunRequested, setCancelRunRequested] = useState(false);
  const cancelRunRef = useRef(false);
  const [busyActionFor, setBusyActionFor] = useState<string>("");
  const [overrideReasonByOrder, setOverrideReasonByOrder] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [openCardId, setOpenCardId] = useState<string>("");

  async function loadOrders() {
    const res = await fetch("/api/orders/credit-review");
    const data = (await res.json()) as ValidatedOrder[];
    setOrders(data);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/orders/credit-review")
      .then((res) => res.json())
      .then((data: ValidatedOrder[]) => {
        if (!cancelled) {
          setOrders(data);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function runCreditRisk() {
    setErr("");
    setBusyRun(true);
    setCancelRunRequested(false);
    cancelRunRef.current = false;
    setAssessments([]);
    setRunProgress({ done: 0, total: orders.length, current: "" });

    const next: AssessmentWithAction[] = [];
    for (let i = 0; i < orders.length; i += 1) {
      if (cancelRunRef.current) break;
      const order = orders[i];
      setRunProgress({ done: i, total: orders.length, current: order.capture_id });
      const res = await fetch("/api/agents/credit-risk/run-one", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capture_id: order.capture_id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; assessment?: CreditRiskAssessment };
      if (!res.ok || !data.assessment) {
        setErr(data.error ?? `Credit risk failed for ${order.capture_id}`);
        continue;
      }
      next.push(data.assessment);
      setAssessments([...next]);
    }
    setRunProgress((prev) => ({ ...prev, done: next.length, current: "" }));
    setBusyRun(false);
  }

  async function applyAction(row: AssessmentWithAction, finalDecision: "approve" | "conditional" | "hold" | "escalate") {
    setErr("");
    setBusyActionFor(row.capture_id);
    const reason = overrideReasonByOrder[row.capture_id] ?? "";
    const isOverride = finalDecision !== row.decision;
    if (isOverride && reason.trim().length === 0) {
      setErr("Provide an override reason before changing the recommended decision.");
      setBusyActionFor("");
      return;
    }

    const res = await fetch("/api/agents/credit-risk/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        capture_id: row.capture_id,
        recommended_decision: row.decision,
        final_decision: finalDecision,
        risk_score: row.risk_score,
        revenue_at_risk: row.metrics.revenue_at_risk,
        bad_debt_delta: row.metrics.bad_debt_delta,
        rationale: row.rationale,
        override_reason: reason.trim() || undefined,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setErr(data.error ?? "Failed to apply credit risk action.");
      setBusyActionFor("");
      return;
    }

    setAssessments((prev) =>
      prev.map((item) =>
        item.capture_id === row.capture_id
          ? {
              ...item,
              final_decision: finalDecision,
              action_status:
                finalDecision === "escalate" ? "escalated" : isOverride ? "overridden" : "accepted",
              override_reason: reason.trim() || undefined,
            }
          : item,
      ),
    );
    setBusyActionFor("");
    loadOrders();
  }

  const orderCount = useMemo(() => orders.length, [orders]);

  function decisionPill(decision: CreditRiskDecision | "escalate") {
    if (decision === "approve") return "APPROVE";
    if (decision === "conditional") return "CONDITIONAL";
    if (decision === "hold") return "HOLD";
    return "ESCALATE";
  }

  return (
    <section>
      {err && <div className="card" style={{ borderColor: "#e5a5a5" }}>{err}</div>}

      <div className="card">
        <div className="row-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="label">Orders for Credit Review</div>
            <div className="value">{orderCount}</div>
            {busyRun && (
              <p className="muted-note" style={{ margin: "6px 0 0" }}>
                Assessed {runProgress.done}/{runProgress.total}
                {runProgress.current ? ` | Running: ${runProgress.current}` : ""}
                {cancelRunRequested ? " | Stopping after current order..." : ""}
              </p>
            )}
          </div>
          <div className="row-actions">
            <button onClick={runCreditRisk} disabled={busyRun}>
              {busyRun ? "Running credit risk agent..." : "Run Credit Risk Agent"}
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

      {assessments.length > 0 && (
        <div className="status-panel-grid" style={{ marginTop: 12 }}>
          {assessments.map((row) => (
            <StatusExpandableCard
              key={row.capture_id}
              title={`${row.capture_id} | Recommended: ${decisionPill(row.decision)}${row.final_decision ? ` | Final: ${decisionPill(row.final_decision)}` : ""}`}
              tone={getCreditTone(row)}
              open={openCardId === row.capture_id}
              onToggle={() => setOpenCardId((prev) => (prev === row.capture_id ? "" : row.capture_id))}
              compact
            >
              <div className="grid-3" style={{ marginTop: 8 }}>
                <div className="metric-box">
                  <div className="label">Risk Score</div>
                  <div className="value value-accent">{row.risk_score.toFixed(1)}</div>
                </div>
                <div className="metric-box">
                  <div className="label">Revenue at Risk</div>
                  <div className="value value-accent">${row.metrics.revenue_at_risk.toFixed(2)}</div>
                </div>
                <div className="metric-box">
                  <div className="label">Bad Debt Delta</div>
                  <div className="value value-accent">${row.metrics.bad_debt_delta.toFixed(2)}</div>
                </div>
              </div>

              <div className="table-wrap" style={{ marginTop: 10 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Decisioning Data Window</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>Order Amount</td><td>${row.metrics.order_amount.toFixed(2)}</td></tr>
                    <tr><td>Credit Limit</td><td>${row.metrics.credit_limit.toFixed(2)}</td></tr>
                    <tr><td>Open AR</td><td>${row.metrics.open_ar.toFixed(2)}</td></tr>
                    <tr><td>Utilization Before</td><td>{(row.metrics.utilization_before * 100).toFixed(1)}%</td></tr>
                    <tr><td>Projected Utilization</td><td>{(row.metrics.projected_utilization * 100).toFixed(1)}%</td></tr>
                    <tr><td>Disputes Open</td><td>{row.metrics.disputes_open}</td></tr>
                    <tr><td>Dispute Rate</td><td>{(row.metrics.dispute_rate * 100).toFixed(1)}%</td></tr>
                    <tr><td>Avg Days Late</td><td>{row.metrics.avg_days_late.toFixed(1)} days</td></tr>
                    <tr><td>Payment Behavior Score</td><td>{row.metrics.payment_behavior_score.toFixed(3)}</td></tr>
                    <tr><td>Customer History Orders</td><td>{row.metrics.customer_history_orders}</td></tr>
                    <tr><td>Customer Avg Order Value</td><td>${row.metrics.customer_history_avg_order_value.toFixed(2)}</td></tr>
                    <tr><td>Recent Order Velocity (30d)</td><td>{row.metrics.recent_order_velocity_count_30d} orders</td></tr>
                    <tr><td>Recent Order Velocity Value (30d)</td><td>${row.metrics.recent_order_velocity_value_30d.toFixed(2)}</td></tr>
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 10 }}>
                <div className="label">Policy Rationale</div>
                {row.rationale.map((line, idx) => (
                  <p key={idx} style={{ margin: "4px 0" }}>{line}</p>
                ))}
              </div>

              {row.hold_reasons.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div className="label">Hold Reasons</div>
                  {row.hold_reasons.map((line, idx) => (
                    <p key={idx} style={{ margin: "4px 0" }}>{line}</p>
                  ))}
                </div>
              )}

              {row.conditions.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div className="label">Conditions</div>
                  {row.conditions.map((line, idx) => (
                    <p key={idx} style={{ margin: "4px 0" }}>{line}</p>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 8 }}>
                <div className="label">Recommendations</div>
                {row.recommendations.map((line, idx) => (
                  <p key={idx} style={{ margin: "4px 0" }}>{line}</p>
                ))}
              </div>

              <div className="form-stack" style={{ marginTop: 10 }}>
                <label>Override Reason (required if changing recommended decision)</label>
                <textarea
                  rows={2}
                  value={overrideReasonByOrder[row.capture_id] ?? ""}
                  onChange={(e) =>
                    setOverrideReasonByOrder((prev) => ({ ...prev, [row.capture_id]: e.target.value }))
                  }
                />
              </div>

              <div className="row-actions" style={{ marginTop: 10 }}>
                <button
                  onClick={() => applyAction(row, row.decision)}
                  disabled={busyActionFor === row.capture_id || Boolean(row.action_status)}
                >
                  Accept Recommendation
                </button>
                <button
                  className="secondary"
                  onClick={() => applyAction(row, "approve")}
                  disabled={busyActionFor === row.capture_id || Boolean(row.action_status)}
                >
                  Override Approve
                </button>
                <button
                  className="secondary"
                  onClick={() => applyAction(row, "hold")}
                  disabled={busyActionFor === row.capture_id || Boolean(row.action_status)}
                >
                  Override Hold
                </button>
                <button
                  className="secondary"
                  onClick={() => applyAction(row, "escalate")}
                  disabled={busyActionFor === row.capture_id || Boolean(row.action_status)}
                >
                  Escalate
                </button>
              </div>
            </StatusExpandableCard>
          ))}
        </div>
      )}
    </section>
  );
}

function getCreditTone(row: AssessmentWithAction): "red" | "amber" | "green" {
  const decision = (row.final_decision ?? row.decision).toLowerCase();
  if (decision === "hold" || decision === "escalate") return "red";
  if (decision === "conditional") return "amber";
  return "green";
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CreditRatedOrder, HeldOrder, HoldResolutionDecision, HoldResolutionProposal, ValidatedOrder } from "@/lib/types";
import StatusExpandableCard from "@/components/status-expandable-card";

type ResultWithStatus = {
  order: HeldOrder;
  proposal: HoldResolutionProposal;
  action_status?: HoldResolutionDecision | "keep_on_hold";
  final_decision?: HoldResolutionDecision | "keep_on_hold";
};

function formatDecision(value: string) {
  return value.replaceAll("_", " ").toUpperCase();
}

export default function HoldResolutionWorkspace() {
  const [validatedOrders, setValidatedOrders] = useState<ValidatedOrder[]>([]);
  const [creditRatedOrders, setCreditRatedOrders] = useState<CreditRatedOrder[]>([]);
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);
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

  async function load() {
    const [validatedRes, creditRes, heldRes] = await Promise.all([
      fetch("/api/orders/validated"),
      fetch("/api/orders/credit-rated"),
      fetch("/api/orders/on-hold"),
    ]);

    const [validated, creditRated, held] = await Promise.all([
      validatedRes.json() as Promise<ValidatedOrder[]>,
      creditRes.json() as Promise<CreditRatedOrder[]>,
      heldRes.json() as Promise<HeldOrder[]>,
    ]);

    setValidatedOrders(validated);
    setCreditRatedOrders(creditRated);
    setHeldOrders(held);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((loadErr: unknown) => {
        const message = loadErr instanceof Error ? loadErr.message : "Failed to load hold resolution data.";
        setErr(message);
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  async function runAgent() {
    setErr("");
    setBusyRun(true);
    setCancelRunRequested(false);
    cancelRunRef.current = false;
    setResults([]);
    setRunProgress({ done: 0, total: heldOrders.length, current: "" });

    const nextResults: ResultWithStatus[] = [];
    for (let i = 0; i < heldOrders.length; i += 1) {
      if (cancelRunRef.current) {
        break;
      }
      const order = heldOrders[i];
      setRunProgress({ done: i, total: heldOrders.length, current: order.capture_id });
      const res = await fetch("/api/agents/hold-resolution/run-one", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capture_id: order.capture_id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; proposal?: HoldResolutionProposal };
      if (!res.ok || !data.proposal) {
        setErr(data.error ?? `Hold resolution failed for ${order.capture_id}`);
        continue;
      }
      nextResults.push({ order, proposal: data.proposal });
      setResults([...nextResults]);
    }

    setRunProgress((prev) => ({ ...prev, done: nextResults.length, current: "" }));
    setBusyRun(false);
  }

  async function applyAction(result: ResultWithStatus, finalDecision: HoldResolutionDecision | "keep_on_hold") {
    setErr("");
    setBusyActionFor(result.order.capture_id);
    const res = await fetch("/api/agents/hold-resolution/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        capture_id: result.order.capture_id,
        recommended_decision: result.proposal.recommended_decision,
        final_decision: finalDecision,
        owner_team: result.proposal.owner_team,
        resolution_summary: result.proposal.internal_note,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setErr(data.error ?? "Failed to record hold resolution action.");
      setBusyActionFor("");
      return;
    }

    setResults((prev) =>
      prev.map((item) =>
        item.order.capture_id === result.order.capture_id
          ? {
              ...item,
              action_status: finalDecision,
              final_decision: finalDecision,
            }
          : item,
      ),
    );
    setBusyActionFor("");
    void load();
  }

  const approvedCount = creditRatedOrders.filter((order) => order.credit_final_decision === "approve").length;
  const holdCount = creditRatedOrders.filter((order) => order.credit_final_decision === "hold").length;
  const releaseReadyCount = useMemo(
    () =>
      results.filter((item) => {
        const decision = item.final_decision ?? item.proposal.recommended_decision;
        return decision === "release" || decision === "conditional_release";
      }).length,
    [results],
  );

  return (
    <section>
      {err && <div className="card" style={{ borderColor: "#e5a5a5" }}>{err}</div>}

      <div className="grid-3">
        <div className="card">
          <div className="label">Validated Orders</div>
          <div className="value">{validatedOrders.length}</div>
        </div>
        <div className="card">
          <div className="label">Credit Rated</div>
          <div className="value">{creditRatedOrders.length}</div>
          <p className="muted-note" style={{ marginTop: 6 }}>
            Approved: {approvedCount} | Hold: {holdCount}
          </p>
        </div>
        <div className="card">
          <div className="label">Orders On Hold</div>
          <div className="value value-accent">{heldOrders.length}</div>
          {results.length > 0 && (
            <p className="muted-note" style={{ marginTop: 6 }}>
              Release ready: {releaseReadyCount}
            </p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="label">Hold Queue</div>
            <div className="value">{heldOrders.length}</div>
            {busyRun && (
              <p className="muted-note" style={{ margin: "6px 0 0" }}>
                Processed {runProgress.done}/{runProgress.total}
                {runProgress.current ? ` | Running: ${runProgress.current}` : ""}
                {cancelRunRequested ? " | Stopping after current order..." : ""}
              </p>
            )}
          </div>
          <div className="row-actions">
            <button onClick={runAgent} disabled={busyRun}>
              {busyRun ? "Running hold resolution..." : "Run Hold Resolution Agent"}
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
        title={`Hold Queue (${heldOrders.length})`}
        tone={heldOrders.length > 0 ? "red" : "green"}
        open={openCardId === "queue"}
        onToggle={() => setOpenCardId((prev) => (prev === "queue" ? "" : "queue"))}
        style={{ marginTop: 12 }}
      >
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>Capture</th>
                <th>Customer</th>
                <th>PO</th>
                <th>Total</th>
                <th>Risk</th>
                <th>Last Credit Action</th>
              </tr>
            </thead>
            <tbody>
              {heldOrders.length === 0 && (
                <tr>
                  <td colSpan={6}>No orders are currently on hold.</td>
                </tr>
              )}
              {heldOrders.map((row) => (
                <tr key={row.capture_id}>
                  <td>{row.capture_id}</td>
                  <td>{row.customer_name}</td>
                  <td>{row.po_number}</td>
                  <td>{row.currency} {Number(row.total_amount).toFixed(2)}</td>
                  <td>{Number(row.credit_risk_score).toFixed(1)}</td>
                  <td>{row.credit_action_created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StatusExpandableCard>

      {results.length > 0 && (
        <div className="status-panel-grid" style={{ marginTop: 12 }}>
          {results.map((result) => {
            const decision = result.final_decision ?? result.proposal.recommended_decision;
            return (
              <StatusExpandableCard
                key={result.order.capture_id}
                title={result.order.customer_name}
                subtitle={`${formatDecision(decision)} | See actions`}
                tone={getHoldTone(decision)}
                open={openCardId === result.order.capture_id}
                onToggle={() => setOpenCardId((prev) => (prev === result.order.capture_id ? "" : result.order.capture_id))}
                compact
              >
                <div className="grid-3" style={{ marginTop: 8 }}>
                  <div className="metric-box">
                    <div className="label">Recommendation</div>
                    <div className="value value-accent">{formatDecision(result.proposal.recommended_decision)}</div>
                  </div>
                  <div className="metric-box">
                    <div className="label">Owner Team</div>
                    <div className="value">{result.proposal.owner_team}</div>
                  </div>
                  <div className="metric-box">
                    <div className="label">Expected Release</div>
                    <div className="value">{result.proposal.expected_time_to_release_hours}h</div>
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div className="label">Hold Facts</div>
                  <p style={{ margin: "4px 0" }}>
                    {result.order.capture_id} | {result.order.po_number} | Risk {Number(result.order.credit_risk_score).toFixed(1)}
                  </p>
                  {result.order.hold_reasons.length === 0 ? (
                    <p style={{ margin: "4px 0" }}>No explicit hold rationale recorded.</p>
                  ) : (
                    result.order.hold_reasons.map((reason, idx) => (
                      <p key={idx} style={{ margin: "4px 0" }}>{reason}</p>
                    ))
                  )}
                </div>

                <div style={{ marginTop: 10 }}>
                  <div className="label">Required Actions</div>
                  {result.proposal.required_actions.map((step, idx) => (
                    <p key={idx} style={{ margin: "4px 0" }}>{step}</p>
                  ))}
                </div>

                {result.proposal.release_conditions.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div className="label">Release Conditions</div>
                    {result.proposal.release_conditions.map((item, idx) => (
                      <p key={idx} style={{ margin: "4px 0" }}>{item}</p>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 8 }}>
                  <div className="label">Customer Message</div>
                  <p style={{ margin: "4px 0" }}>{result.proposal.customer_message}</p>
                </div>

                <div style={{ marginTop: 8 }}>
                  <div className="label">Internal Note</div>
                  <p style={{ margin: "4px 0" }}>{result.proposal.internal_note}</p>
                </div>

                <div className="row-actions" style={{ marginTop: 12 }}>
                  <button
                    onClick={() => applyAction(result, "release")}
                    disabled={busyActionFor === result.order.capture_id || Boolean(result.action_status)}
                  >
                    Release Hold
                  </button>
                  <button
                    className="secondary"
                    onClick={() => applyAction(result, "conditional_release")}
                    disabled={busyActionFor === result.order.capture_id || Boolean(result.action_status)}
                  >
                    Conditional Release
                  </button>
                  <button
                    className="secondary"
                    onClick={() => applyAction(result, "keep_on_hold")}
                    disabled={busyActionFor === result.order.capture_id || Boolean(result.action_status)}
                  >
                    Keep On Hold
                  </button>
                  <button
                    className="secondary"
                    onClick={() => applyAction(result, "escalate")}
                    disabled={busyActionFor === result.order.capture_id || Boolean(result.action_status)}
                  >
                    Escalate
                  </button>
                </div>
              </StatusExpandableCard>
            );
          })}
        </div>
      )}
    </section>
  );
}

function getHoldTone(decision: HoldResolutionDecision | "keep_on_hold"): "red" | "amber" | "green" {
  if (decision === "release") return "green";
  if (decision === "conditional_release") return "amber";
  return "red";
}

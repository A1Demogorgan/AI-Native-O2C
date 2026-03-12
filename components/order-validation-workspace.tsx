"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CapturedOrder, OrderValidationResult } from "@/lib/types";
import StatusExpandableCard from "@/components/status-expandable-card";

type ResultWithStatus = OrderValidationResult & {
  action_status?: "accepted" | "rejected" | "declined";
};

function parseLineItems(raw: string) {
  try {
    const parsed = JSON.parse(raw) as Array<{ sku: string; quantity: number; unit_price: number }>;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function OrderValidationWorkspace() {
  const [orders, setOrders] = useState<CapturedOrder[]>([]);
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

  async function loadOrders() {
    const res = await fetch("/api/orders/validation-queue");
    const data = (await res.json()) as CapturedOrder[];
    setOrders(data);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/orders/validation-queue")
      .then((res) => res.json())
      .then((data: CapturedOrder[]) => {
        if (!cancelled) {
          setOrders(data);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function runValidation() {
    setErr("");
    setCancelRunRequested(false);
    cancelRunRef.current = false;
    setBusyRun(true);
    setResults([]);
    setRunProgress({ done: 0, total: orders.length, current: "" });

    const nextResults: ResultWithStatus[] = [];
    for (let i = 0; i < orders.length; i += 1) {
      if (cancelRunRef.current) {
        break;
      }
      const order = orders[i];
      setRunProgress({ done: i, total: orders.length, current: order.capture_id });
      const res = await fetch("/api/agents/order-validation/run-one", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capture_id: order.capture_id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; result?: OrderValidationResult };
      if (!res.ok || !data.result) {
        setErr(data.error ?? `Validation failed for ${order.capture_id}`);
        continue;
      }
      nextResults.push(data.result);
      setResults([...nextResults]);
    }
    setRunProgress((prev) => ({ ...prev, done: nextResults.length, current: "" }));
    setBusyRun(false);
  }

  async function applyAction(row: ResultWithStatus, action: "accept" | "reject" | "decline") {
    setErr("");
    setBusyActionFor(row.capture_id);
    const res = await fetch("/api/agents/order-validation/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        capture_id: row.capture_id,
        action,
        original: row.original,
        proposed: row.proposed,
        discrepancies: row.discrepancies,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setErr(data.error ?? "Validation action failed.");
      setBusyActionFor("");
      return;
    }

    setResults((prev) =>
      prev.map((item) =>
        item.capture_id === row.capture_id
          ? {
              ...item,
              action_status: action === "accept" ? "accepted" : action === "reject" ? "rejected" : "declined",
            }
          : item,
      ),
    );
    setBusyActionFor("");
    loadOrders();
  }

  const orderCount = useMemo(() => orders.length, [orders]);

  return (
    <section>
      {err && <div className="card" style={{ borderColor: "#e5a5a5" }}>{err}</div>}

      <div className="card">
        <div className="row-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="label">Generated Orders</div>
            <div className="value">{orderCount}</div>
            {busyRun && (
              <p className="muted-note" style={{ margin: "6px 0 0" }}>
                Validated {runProgress.done}/{runProgress.total}
                {runProgress.current ? ` | Running: ${runProgress.current}` : ""}
                {cancelRunRequested ? " | Stopping after current order..." : ""}
              </p>
            )}
          </div>
          <div className="row-actions">
            <button onClick={runValidation} disabled={busyRun}>
              {busyRun ? "Running validation agent..." : "Run Validation Agent"}
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
        title={`Order List (${orders.length})`}
        tone={orders.length > 0 ? "amber" : "green"}
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
                <th>Requested Date</th>
                <th>Total</th>
                <th>Items</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((row) => (
                <tr key={row.capture_id}>
                  <td>{row.capture_id}</td>
                  <td>{row.customer_name}</td>
                  <td>{row.po_number}</td>
                  <td>{row.requested_date}</td>
                  <td>{row.currency} {Number(row.total_amount).toFixed(2)}</td>
                  <td>{parseLineItems(row.line_items_json).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StatusExpandableCard>

      {results.length > 0 && (
        <div className="status-panel-grid" style={{ marginTop: 12 }}>
          {results.map((row) => (
            <StatusExpandableCard
              key={row.capture_id}
              title={`${row.capture_id} | Recommendation: ${row.recommendation.toUpperCase()}${row.action_status ? ` | Action: ${row.action_status.toUpperCase()}` : ""}`}
              tone={getValidationTone(row)}
              open={openCardId === row.capture_id}
              onToggle={() => setOpenCardId((prev) => (prev === row.capture_id ? "" : row.capture_id))}
              compact
            >
              <p style={{ marginTop: 10 }}>{row.summary}</p>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Issue</th>
                      <th>Severity</th>
                      <th>Current</th>
                      <th>Proposed</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.discrepancies.length === 0 && (
                      <tr>
                        <td colSpan={6}>No discrepancies detected.</td>
                      </tr>
                    )}
                    {row.discrepancies.map((d, idx) => (
                      <tr key={`${row.capture_id}-${idx}`}>
                        <td>{d.field}</td>
                        <td>{d.issue}</td>
                        <td>{d.severity}</td>
                        <td>{d.from_value}</td>
                        <td>{d.to_value}</td>
                        <td>{d.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="row-actions" style={{ marginTop: 10 }}>
                <button
                  onClick={() => applyAction(row, "accept")}
                  disabled={busyActionFor === row.capture_id || Boolean(row.action_status)}
                >
                  Accept Changes
                </button>
                <button
                  className="secondary"
                  onClick={() => applyAction(row, "reject")}
                  disabled={busyActionFor === row.capture_id || Boolean(row.action_status)}
                >
                  Reject Changes
                </button>
                <button
                  className="secondary"
                  onClick={() => applyAction(row, "decline")}
                  disabled={busyActionFor === row.capture_id || Boolean(row.action_status)}
                >
                  Decline Order
                </button>
              </div>
            </StatusExpandableCard>
          ))}
        </div>
      )}
    </section>
  );
}

function getValidationTone(row: ResultWithStatus): "red" | "amber" | "green" {
  if (row.action_status === "declined") return "red";
  if (row.action_status === "rejected") return "amber";
  if (row.action_status === "accepted") return "green";
  if (row.recommendation === "decline") return "red";
  if (row.recommendation === "review") return "amber";
  return "green";
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import StatusExpandableCard from "@/components/status-expandable-card";
import type { EdiOrderAction, EdiOrderRecord } from "@/lib/types";

function outcomeTone(order: EdiOrderRecord): "red" | "amber" | "green" {
  if (order.processing_outcome === "fail") return "red";
  if (order.action === "hold" || order.action === "reject") return "amber";
  return "green";
}

export default function EdiOrderCaptureWorkspace() {
  const [orders, setOrders] = useState<EdiOrderRecord[]>([]);
  const [busyRun, setBusyRun] = useState(false);
  const [runProgress, setRunProgress] = useState({ done: 0, total: 0, current: "" });
  const [cancelRunRequested, setCancelRunRequested] = useState(false);
  const cancelRunRef = useRef(false);
  const [busyActionFor, setBusyActionFor] = useState("");
  const [err, setErr] = useState("");
  const [openCardId, setOpenCardId] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/edi-orders")
      .then((res) => res.json())
      .then((data: EdiOrderRecord[]) => {
        if (!cancelled) {
          setOrders(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErr("Unable to load EDI orders.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function processSingleOrder(fileName: string) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetch("/api/edi-orders/process-one", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_name: fileName }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; order?: EdiOrderRecord };
        if (!res.ok || !data.order) {
          throw new Error(data.error ?? `Failed to process ${fileName}`);
        }
        return data.order;
      } catch (error) {
        if (attempt === 1) {
          throw error;
        }
      }
    }

    throw new Error(`Failed to process ${fileName}`);
  }

  async function runValidation() {
    setErr("");
    setBusyRun(true);
    setCancelRunRequested(false);
    cancelRunRef.current = false;

    const queue = orders.filter((order) => !order.processed);
    setRunProgress({ done: 0, total: queue.length, current: "" });
    if (queue.length === 0) {
      setBusyRun(false);
      return;
    }

    const nextOrders = [...orders];
    const hardFailures: string[] = [];
    for (let index = 0; index < queue.length; index += 1) {
      if (cancelRunRef.current) {
        break;
      }
      const current = queue[index];
      setRunProgress({ done: index, total: queue.length, current: current.file_name });
      try {
        const updated = await processSingleOrder(current.file_name);
        const updatedIndex = nextOrders.findIndex((row) => row.file_name === current.file_name);
        if (updatedIndex >= 0) {
          nextOrders[updatedIndex] = updated;
          setOrders([...nextOrders]);
        }
      } catch (error) {
        hardFailures.push(
          error instanceof Error && error.message ? error.message : `Failed to process ${current.file_name}`,
        );
        continue;
      }
    }

    setRunProgress((prev) => ({ ...prev, done: prev.total, current: "" }));
    setErr(hardFailures.length > 0 ? hardFailures.join(" | ") : "");
    setBusyRun(false);
  }

  async function applyAction(fileName: string, action: EdiOrderAction) {
    setErr("");
    setBusyActionFor(fileName);
    const res = await fetch("/api/edi-orders/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_name: fileName, action }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; order?: EdiOrderRecord };
    if (!res.ok || !data.order) {
      setErr(data.error ?? "Failed to apply action.");
      setBusyActionFor("");
      return;
    }
    setOrders((prev) => prev.map((row) => (row.file_name === fileName ? data.order! : row)));
    setBusyActionFor("");
  }

  async function resetOrder(fileName: string) {
    setErr("");
    setBusyActionFor(fileName);
    const res = await fetch("/api/edi-orders/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_name: fileName }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; order?: EdiOrderRecord };
    if (!res.ok || !data.order) {
      setErr(data.error ?? "Failed to reset EDI order.");
      setBusyActionFor("");
      return;
    }
    setOrders((prev) => prev.map((row) => (row.file_name === fileName ? data.order! : row)));
    setBusyActionFor("");
    setOpenCardId((prev) => (prev === fileName ? "" : prev));
  }

  async function resetAllOrders() {
    setErr("");
    setBusyRun(true);
    const res = await fetch("/api/edi-orders/reset-all", {
      method: "POST",
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; orders?: EdiOrderRecord[] };
    if (!res.ok || !data.orders) {
      setErr(data.error ?? "Failed to reset all EDI orders.");
      setBusyRun(false);
      return;
    }
    setOrders(data.orders);
    setBusyRun(false);
    setOpenCardId("");
  }

  const summary = useMemo(() => {
    const processed = orders.filter((order) => order.processed);
    const passed = processed.filter((order) => order.processing_outcome === "pass").length;
    const failed = processed.filter((order) => order.processing_outcome === "fail").length;
    const accepted = processed.filter((order) => order.action === "accept").length;
    const rejected = processed.filter((order) => order.action === "reject").length;
    const held = processed.filter((order) => order.action === "hold").length;
    const totalValue = orders.reduce((sum, order) => sum + order.total_amount, 0);
    const backlogValue = orders.filter((order) => !order.processed).reduce((sum, order) => sum + order.total_amount, 0);
    const exceptionValue = processed
      .filter((order) => order.processing_outcome === "fail" || order.action === "hold" || order.action === "reject")
      .reduce((sum, order) => sum + order.total_amount, 0);
    const passRate = processed.length > 0 ? passed / processed.length : 0;
    const exceptionRate = processed.length > 0 ? failed / processed.length : 0;
    return {
      total: orders.length,
      unprocessed: orders.filter((order) => !order.processed).length,
      processed: processed.length,
      passed,
      failed,
      accepted,
      rejected,
      held,
      totalValue,
      backlogValue,
      exceptionValue,
      passRate,
      exceptionRate,
    };
  }, [orders]);

  const processedOrders = useMemo(
    () =>
      [...orders]
        .filter((order) => order.processed)
        .sort((a, b) => {
          if (a.processing_outcome === b.processing_outcome) return a.file_name.localeCompare(b.file_name);
          return a.processing_outcome === "fail" ? -1 : 1;
        }),
    [orders],
  );

  return (
    <section>
      {err && <div className="card" style={{ borderColor: "#e5a5a5" }}>{err}</div>}

      <div className="card">
        <div className="row-actions" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div className="label">EDI Purchase Orders</div>
            <div className="value">{summary.total}</div>
            <p className="muted-note" style={{ margin: "6px 0 0" }}>
              ${summary.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} total order value | {summary.unprocessed} unprocessed
            </p>
            {busyRun && (
              <p className="muted-note" style={{ margin: "6px 0 0" }}>
                Processed {runProgress.done}/{runProgress.total}
                {runProgress.current ? ` | Running: ${runProgress.current}` : ""}
                {cancelRunRequested ? " | Stopping after current file..." : ""}
              </p>
            )}
          </div>

          <div className="row-actions">
            <button onClick={runValidation} disabled={busyRun || summary.unprocessed === 0}>
              {busyRun ? "Processing EDI orders..." : "Process EDI orders"}
            </button>
            <button className="secondary" onClick={resetAllOrders} disabled={busyRun || summary.processed === 0}>
              Reset All To Unprocessed
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

        <div className="grid-4" style={{ marginTop: 12 }}>
          <div className="metric-box">
            <div className="label">Backlog</div>
            <div className="value">{summary.unprocessed}</div>
            <div className="muted-note">${summary.backlogValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} pending</div>
          </div>
          <div className="metric-box">
            <div className="label">Pass Rate</div>
            <div className="value">{(summary.passRate * 100).toFixed(1)}%</div>
            <div className="muted-note">{summary.passed} of {summary.processed} processed</div>
          </div>
          <div className="metric-box">
            <div className="label">Exception Rate</div>
            <div className="value">{(summary.exceptionRate * 100).toFixed(1)}%</div>
            <div className="muted-note">{summary.failed} failed validation</div>
          </div>
          <div className="metric-box">
            <div className="label">Accepted</div>
            <div className="value">{summary.accepted}</div>
            <div className="muted-note">{summary.processed - summary.accepted} still need disposition</div>
          </div>
          <div className="metric-box">
            <div className="label">On Hold</div>
            <div className="value">{summary.held}</div>
            <div className="muted-note">{summary.rejected} rejected</div>
          </div>
          <div className="metric-box">
            <div className="label">Value At Risk</div>
            <div className="value">${summary.exceptionValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <div className="muted-note">failed, held, or rejected orders</div>
          </div>
        </div>
      </div>

      <StatusExpandableCard
        title={`Existing EDI Orders (${orders.length})`}
        tone={summary.unprocessed > 0 ? "amber" : "green"}
        open={openCardId === "queue"}
        onToggle={() => setOpenCardId((prev) => (prev === "queue" ? "" : "queue"))}
        style={{ marginTop: 12 }}
      >
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Buyer</th>
                <th>PO</th>
                <th>Order Date</th>
                <th>Requested</th>
                <th>Total</th>
                <th>Processed</th>
                <th>Result</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((row) => (
                <tr key={row.file_name}>
                  <td>{row.file_name}</td>
                  <td>{row.buyer_name}</td>
                  <td>{row.po_number}</td>
                  <td>{row.order_date || "--"}</td>
                  <td>{row.requested_date || "--"}</td>
                  <td>{row.currency} {row.total_amount.toFixed(2)}</td>
                  <td>{row.processed ? "Yes" : "No"}</td>
                  <td>{row.processing_outcome ?? "--"}</td>
                  <td>{row.action ?? "--"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StatusExpandableCard>

      {processedOrders.length > 0 && (
        <div className="status-panel-grid" style={{ marginTop: 12 }}>
          {processedOrders.map((row) => (
            <StatusExpandableCard
              key={row.file_name}
              title={`${row.file_name} | ${row.processing_outcome === "pass" ? "PASS" : "FAIL"}${row.action ? ` | Action: ${row.action.toUpperCase()}` : ""}`}
              subtitle={`${row.buyer_name} | PO ${row.po_number}`}
              tone={outcomeTone(row)}
              open={openCardId === row.file_name}
              onToggle={() => setOpenCardId((prev) => (prev === row.file_name ? "" : row.file_name))}
              compact
            >
              <div className="grid-3" style={{ marginTop: 10 }}>
                <div className="metric-box">
                  <div className="label">Ship To</div>
                  <div>{row.ship_to || "--"}</div>
                </div>
                <div className="metric-box">
                  <div className="label">Control IDs</div>
                  <div>{row.interchange_control_number} / {row.transaction_set_control_number}</div>
                </div>
                <div className="metric-box">
                  <div className="label">Line Count</div>
                  <div>{row.line_count}</div>
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Rule</th>
                      <th>Field</th>
                      <th>Severity</th>
                      <th>Actual</th>
                      <th>Expected</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.issues.length === 0 && (
                      <tr>
                        <td colSpan={6}>No business rule exceptions detected.</td>
                      </tr>
                    )}
                    {row.issues.map((item, index) => (
                      <tr key={`${row.file_name}-${index}`}>
                        <td>{item.code}</td>
                        <td>{item.field}</td>
                        <td>{item.severity}</td>
                        <td>{item.actual}</td>
                        <td>{item.expected}</td>
                        <td>{item.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Line</th>
                      <th>SKU</th>
                      <th>Description</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.lines.map((line) => (
                      <tr key={`${row.file_name}-${line.line_number}`}>
                        <td>{line.line_number}</td>
                        <td>{line.sku}</td>
                        <td>{line.description}</td>
                        <td>{line.quantity}</td>
                        <td>{line.unit_price.toFixed(2)}</td>
                        <td>{line.line_total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="row-actions" style={{ marginTop: 10 }}>
                <button onClick={() => applyAction(row.file_name, "accept")} disabled={busyActionFor === row.file_name}>
                  Accept
                </button>
                <button
                  className="secondary"
                  onClick={() => applyAction(row.file_name, "reject")}
                  disabled={busyActionFor === row.file_name}
                >
                  Reject
                </button>
                <button
                  className="secondary"
                  onClick={() => applyAction(row.file_name, "hold")}
                  disabled={busyActionFor === row.file_name}
                >
                  Hold
                </button>
                <button
                  className="secondary"
                  onClick={() => resetOrder(row.file_name)}
                  disabled={busyActionFor === row.file_name}
                >
                  Reset
                </button>
              </div>
            </StatusExpandableCard>
          ))}
        </div>
      )}
    </section>
  );
}

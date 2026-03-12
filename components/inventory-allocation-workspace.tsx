"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AllocationEligibleOrder,
  InventoryAllocationDecision,
  InventoryAllocationProposal,
  InventoryPosition,
} from "@/lib/types";
import StatusExpandableCard from "@/components/status-expandable-card";

type ResultWithStatus = {
  order: AllocationEligibleOrder;
  proposal: InventoryAllocationProposal;
  action_status?: "accepted" | "overridden";
  final_decision?: InventoryAllocationDecision;
};

function formatDecision(value: string) {
  return value.replaceAll("_", " ").toUpperCase();
}

export default function InventoryAllocationWorkspace() {
  const [inventory, setInventory] = useState<InventoryPosition[]>([]);
  const [orders, setOrders] = useState<AllocationEligibleOrder[]>([]);
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
    const [inventoryRes, ordersRes] = await Promise.all([
      fetch("/api/inventory"),
      fetch("/api/orders/allocation-eligible"),
    ]);

    const [inventoryRows, orderRows] = await Promise.all([
      inventoryRes.json() as Promise<InventoryPosition[]>,
      ordersRes.json() as Promise<AllocationEligibleOrder[]>,
    ]);

    setInventory(inventoryRows);
    setOrders(orderRows);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((loadErr: unknown) => {
        const message = loadErr instanceof Error ? loadErr.message : "Failed to load inventory allocation data.";
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
    setRunProgress({ done: 0, total: orders.length, current: "" });

    const nextResults: ResultWithStatus[] = [];
    for (let i = 0; i < orders.length; i += 1) {
      if (cancelRunRef.current) {
        break;
      }
      const order = orders[i];
      setRunProgress({ done: i, total: orders.length, current: order.capture_id });
      const res = await fetch("/api/agents/inventory-allocation/run-one", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capture_id: order.capture_id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; proposal?: InventoryAllocationProposal };
      if (!res.ok || !data.proposal) {
        setErr(data.error ?? `Inventory allocation failed for ${order.capture_id}`);
        continue;
      }
      nextResults.push({ order, proposal: data.proposal });
      setResults([...nextResults]);
    }

    setRunProgress((prev) => ({ ...prev, done: nextResults.length, current: "" }));
    setBusyRun(false);
  }

  async function applyAction(result: ResultWithStatus, finalDecision: InventoryAllocationDecision) {
    setErr("");
    setBusyActionFor(result.order.capture_id);
    const res = await fetch("/api/agents/inventory-allocation/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        capture_id: result.order.capture_id,
        recommended_decision: result.proposal.decision,
        final_decision: finalDecision === result.proposal.decision ? "accepted" : finalDecision,
        fill_rate: result.proposal.fill_rate,
        revenue_at_risk: result.proposal.revenue_at_risk,
        summary: result.proposal.summary,
        lines: result.proposal.lines,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setErr(data.error ?? "Failed to record inventory allocation action.");
      setBusyActionFor("");
      return;
    }

    setResults((prev) =>
      prev.map((item) =>
        item.order.capture_id === result.order.capture_id
          ? {
              ...item,
              action_status: finalDecision === result.proposal.decision ? "accepted" : "overridden",
              final_decision: finalDecision,
            }
          : item,
      ),
    );
    setBusyActionFor("");
    void load();
  }

  const fullyAllocatable = useMemo(
    () =>
      results.filter((item) => (item.final_decision ?? item.proposal.decision) === "allocate_full").length,
    [results],
  );
  const exceptionOrders = useMemo(
    () =>
      results.filter((item) => (item.final_decision ?? item.proposal.decision) !== "allocate_full").length,
    [results],
  );
  const revenueAtRisk = useMemo(
    () => results.reduce((sum, item) => sum + item.proposal.revenue_at_risk, 0),
    [results],
  );

  return (
    <section>
      {err && <div className="card" style={{ borderColor: "#e5a5a5" }}>{err}</div>}

      <div className="grid-3">
        <div className="card">
          <div className="label">Eligible Orders</div>
          <div className="value">{orders.length}</div>
        </div>
        <div className="card">
          <div className="label">Fully Allocatable</div>
          <div className="value">{fullyAllocatable}</div>
        </div>
        <div className="card">
          <div className="label">Exception Orders</div>
          <div className="value value-accent">{exceptionOrders}</div>
          <p className="muted-note" style={{ marginTop: 6 }}>
            Revenue at risk: ${revenueAtRisk.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row-actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="label">Allocation Queue</div>
            <div className="value">{orders.length}</div>
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
              {busyRun ? "Running inventory allocation..." : "Run Inventory Allocation Agent"}
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
        title={`Inventory Positions (${inventory.length})`}
        tone="green"
        open={openCardId === "inventory"}
        onToggle={() => setOpenCardId((prev) => (prev === "inventory" ? "" : "inventory"))}
        style={{ marginTop: 12 }}
      >
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Location</th>
                <th>Available</th>
                <th>Reserved</th>
                <th>Inbound</th>
                <th>Next Inbound</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((row) => (
                <tr key={row.inventory_id}>
                  <td>{row.sku}</td>
                  <td>{row.location}</td>
                  <td>{Number(row.available_qty).toFixed(0)}</td>
                  <td>{Number(row.reserved_qty).toFixed(0)}</td>
                  <td>{Number(row.inbound_qty).toFixed(0)}</td>
                  <td>{row.next_inbound_date ?? "--"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StatusExpandableCard>

      <StatusExpandableCard
        title={`Eligible Order Queue (${orders.length})`}
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
                <th>Total</th>
                <th>Requested Date</th>
                <th>Release Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5}>No allocation-eligible orders in queue.</td>
                </tr>
              )}
              {orders.map((row) => (
                <tr key={row.capture_id}>
                  <td>{row.capture_id}</td>
                  <td>{row.customer_name}</td>
                  <td>{row.currency} {Number(row.total_amount).toFixed(2)}</td>
                  <td>{row.requested_date}</td>
                  <td>{formatDecision(row.allocation_release_status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StatusExpandableCard>

      {results.length > 0 && (
        <div className="status-panel-grid" style={{ marginTop: 12 }}>
          {results.map((result) => {
            const decision = result.final_decision ?? result.proposal.decision;
            return (
              <StatusExpandableCard
                key={result.order.capture_id}
                title={result.order.customer_name}
                subtitle={`${formatDecision(decision)} | See actions`}
                tone={getAllocationTone(decision)}
                open={openCardId === result.order.capture_id}
                onToggle={() => setOpenCardId((prev) => (prev === result.order.capture_id ? "" : result.order.capture_id))}
                compact
              >
                <div className="grid-3" style={{ marginTop: 8 }}>
                  <div className="metric-box">
                    <div className="label">Recommendation</div>
                    <div className="value value-accent">{formatDecision(result.proposal.decision)}</div>
                  </div>
                  <div className="metric-box">
                    <div className="label">Fill Rate</div>
                    <div className="value">{(result.proposal.fill_rate * 100).toFixed(1)}%</div>
                  </div>
                  <div className="metric-box">
                    <div className="label">Revenue At Risk</div>
                    <div className="value">${result.proposal.revenue_at_risk.toFixed(2)}</div>
                  </div>
                </div>

                <p style={{ marginTop: 10 }}>{result.proposal.summary}</p>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Ordered</th>
                        <th>Allocated</th>
                        <th>Backordered</th>
                        <th>Status</th>
                        <th>Location</th>
                        <th>Substitute</th>
                        <th>Ship Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.proposal.lines.map((line, idx) => (
                        <tr key={`${result.order.capture_id}-${idx}`}>
                          <td>{line.sku}</td>
                          <td>{line.ordered_qty}</td>
                          <td>{line.allocated_qty}</td>
                          <td>{line.backordered_qty}</td>
                          <td>{line.status}</td>
                          <td>{line.source_location ?? "--"}</td>
                          <td>{line.substitute_sku ?? "--"}</td>
                          <td>{line.proposed_ship_date ?? "--"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 8 }}>
                  <div className="label">Recommended Actions</div>
                  {result.proposal.recommended_actions.map((action, idx) => (
                    <p key={idx} style={{ margin: "4px 0" }}>{action}</p>
                  ))}
                  {result.proposal.escalation_reason && (
                    <p className="muted-note" style={{ margin: "6px 0 0" }}>
                      Escalation note: {result.proposal.escalation_reason}
                    </p>
                  )}
                </div>

                <div className="row-actions" style={{ marginTop: 12 }}>
                  <button
                    onClick={() => applyAction(result, result.proposal.decision)}
                    disabled={busyActionFor === result.order.capture_id || Boolean(result.action_status)}
                  >
                    Accept Recommendation
                  </button>
                  <button
                    className="secondary"
                    onClick={() => applyAction(result, "split_shipment")}
                    disabled={busyActionFor === result.order.capture_id || Boolean(result.action_status)}
                  >
                    Split Shipment
                  </button>
                  <button
                    className="secondary"
                    onClick={() => applyAction(result, "backorder")}
                    disabled={busyActionFor === result.order.capture_id || Boolean(result.action_status)}
                  >
                    Backorder
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

function getAllocationTone(decision: InventoryAllocationDecision): "red" | "amber" | "green" {
  if (decision === "allocate_full") return "green";
  if (decision === "allocate_partial" || decision === "substitute" || decision === "split_shipment" || decision === "backorder") {
    return "amber";
  }
  return "red";
}

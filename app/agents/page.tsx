"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import OrderCaptureWorkspace from "@/components/order-capture-workspace";
import EdiOrderCaptureWorkspace from "@/components/edi-order-capture-workspace";
import OrderValidationWorkspace from "@/components/order-validation-workspace";
import CreditRiskWorkspace from "@/components/credit-risk-workspace";
import HoldResolutionWorkspace from "@/components/hold-resolution-workspace";
import InventoryAllocationWorkspace from "@/components/inventory-allocation-workspace";
import { useConsultantSelection } from "@/components/consultant-context";
import SequentialReviewWorkspace from "@/components/sequential-review-workspace";
import { AGENT_CATALOG } from "@/lib/agents/catalog";
import type { AgentKpiSummary, OrderMailbox } from "@/lib/types";

type KpiPayload = {
  as_of: string;
  agents: AgentKpiSummary[];
};

type WorkflowStage = {
  stage: string;
  agents: Array<{ id: string; label: string }>;
};

const STAGES: WorkflowStage[] = [
  {
    stage: "Order Management",
    agents: [
      { id: "order-capture", label: "Order Capture - Email" },
      { id: "order-capture-edi", label: "Order Capture - EDI" },
      { id: "order-capture-chatbot", label: "Order Capture - Chatbot" },
      { id: "order-validation", label: "Order Validation" },
      { id: "credit-risk", label: "Credit Risk" },
      { id: "hold-resolution", label: "Hold Resolution" },
    ],
  },
  {
    stage: "Shipping",
    agents: [
      { id: "inventory-allocation", label: "Inventory & Allocation" },
      { id: "shipment-planning", label: "Shipment Planning" },
    ],
  },
  {
    stage: "Billing",
    agents: [
      { id: "billing-intelligence", label: "Billing Intelligence" },
      { id: "invoice-matching", label: "Invoice Matching" },
    ],
  },
  {
    stage: "Cash & Collections",
    agents: [
      { id: "payment-prediction", label: "Payment Prediction" },
      { id: "collections-strategy", label: "Collections Strategy" },
      { id: "collections-communications", label: "Collections Communications" },
      { id: "cash-application", label: "Cash Application" },
      { id: "dispute-triage-resolution", label: "Dispute Triage & Resolution" },
    ],
  },
];

const WORKSPACE_ROUTES: Record<string, string> = {
  "order-capture": "/order-capture",
};

function formatMetric(value: number | null, unit: string) {
  if (value === null) return "--";
  if (unit === "percent") return `${(value * 100).toFixed(1)}%`;
  if (unit === "currency") return `$${value.toFixed(2)}`;
  if (unit === "days") return `${value.toFixed(1)} days`;
  if (unit === "minutes") return `${value.toFixed(1)} mins`;
  return value.toFixed(2);
}

export default function AgentsPage() {
  const router = useRouter();
  const { setArea } = useConsultantSelection();
  const [selectedAgent, setSelectedAgent] = useState<string>("order-capture");
  const [payload, setPayload] = useState<KpiPayload | null>(null);
  const [mailboxes, setMailboxes] = useState<OrderMailbox[]>([]);
  const [selectedMailbox, setSelectedMailbox] = useState<string>("");
  const [showOrderWorkspace, setShowOrderWorkspace] = useState(false);
  const [orderAutoloadNonce, setOrderAutoloadNonce] = useState(0);

  useEffect(() => {
    fetch("/api/agents/kpis")
      .then((res) => res.json())
      .then((data: KpiPayload) => setPayload(data));

    fetch("/api/order-capture/mailboxes")
      .then((res) => res.json())
      .then((rows: OrderMailbox[]) => {
        setMailboxes(rows);
        if (rows.length > 0) {
          setSelectedMailbox(rows[0].mailbox_id);
        }
      });
  }, []);

  const metricAgentId = selectedAgent === "order-capture-chatbot" ? "order-capture" : selectedAgent;
  const selectedDef = useMemo(() => AGENT_CATALOG.find((a) => a.id === metricAgentId) ?? AGENT_CATALOG[0], [metricAgentId]);
  const selectedKpis = useMemo(
    () => payload?.agents.find((agent) => agent.agent_id === metricAgentId) ?? null,
    [payload, metricAgentId],
  );
  const selectedAgentName = selectedAgent === "order-capture-chatbot" ? "Order Capture Agent" : selectedDef.name;
  const workspaceRoute = WORKSPACE_ROUTES[metricAgentId] ?? null;
  const hasCustomWorkspace =
    selectedAgent === "order-capture-edi" ||
    selectedAgent === "order-validation" ||
    selectedAgent === "credit-risk" ||
    selectedAgent === "hold-resolution" ||
    selectedAgent === "inventory-allocation" ||
    selectedAgent === "shipment-planning" ||
    selectedAgent === "billing-intelligence" ||
    selectedAgent === "invoice-matching" ||
    selectedAgent === "payment-prediction" ||
    selectedAgent === "collections-strategy" ||
    selectedAgent === "collections-communications" ||
    selectedAgent === "cash-application" ||
    selectedAgent === "dispute-triage-resolution";

  useEffect(() => {
    setArea({
      areaId: metricAgentId,
      areaLabel: selectedAgentName,
    });
    return () => {
      setArea(null);
    };
  }, [metricAgentId, selectedAgentName, setArea]);

  function loadOrderMailExperience() {
    if (!selectedMailbox) {
      return;
    }
    setShowOrderWorkspace(true);
    setOrderAutoloadNonce(Date.now());
  }

  return (
    <section className="agents-layout">
      <aside className="agents-sidebar">
        <h3>O2C Process Steps</h3>
        {STAGES.map((group) => (
          <div key={group.stage} className="stage-block">
            <div className="label">{group.stage}</div>
            <div className="stage-menu">
              {group.agents.map((agent) => (
                <button
                  key={agent.id}
                  className={`stage-item ${selectedAgent === agent.id ? "stage-item-active" : ""}`}
                  onClick={() => {
                    if (agent.id === "order-capture-chatbot") {
                      router.push("/agents/chatbot");
                      return;
                    }
                    setSelectedAgent(agent.id);
                    if (agent.id === "order-capture") {
                      setShowOrderWorkspace(false);
                    }
                  }}
                >
                  {agent.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </aside>

      <div className="agents-main">
        <h1 className="agents-title">{selectedAgentName}</h1>
        <article className="card">
          <div className="label" style={{ marginTop: 0 }}>Key KPIs</div>

          <div className="grid-3" style={{ marginTop: 8 }}>
            {(selectedKpis?.kpis ?? selectedDef.kpiLabels.map((label, idx) => ({ key: `${idx}`, label, value: null, unit: "count" }))).map(
              (metric) => (
                <div className="metric-box" key={metric.key}>
                  <div className="label">{metric.label}</div>
                  <div className="value value-accent">{formatMetric(metric.value, metric.unit)}</div>
                </div>
              ),
            )}
          </div>

          {!workspaceRoute && !hasCustomWorkspace && (
            <div className="row-actions" style={{ marginTop: 12 }}>
              <span className="muted-note">This agent is in catalog/planning mode.</span>
            </div>
          )}
        </article>

        {selectedAgent === "order-capture" && (
          <article className="card" style={{ marginTop: 12 }}>
            <div className="label">Order Capture Agent Input</div>
            <div className="metric-box form-stack order-mail-box" style={{ marginTop: 8 }}>
              <div className="label">Order Mail</div>
              <select className="order-mail-select" value={selectedMailbox} onChange={(e) => setSelectedMailbox(e.target.value)}>
                {mailboxes.map((box) => (
                  <option key={box.mailbox_id} value={box.mailbox_id}>
                    {box.display_name}
                  </option>
                ))}
              </select>
              <button className="order-mail-button" onClick={loadOrderMailExperience} disabled={!selectedMailbox}>
                Pull latest email
              </button>
            </div>
          </article>
        )}

        {selectedAgent === "order-capture" && showOrderWorkspace && (
          <article className="card" style={{ marginTop: 12 }}>
            <div className="label">Order Capture Agent Workspace</div>
            <OrderCaptureWorkspace
              showTitle={false}
              hideMailboxControls
              externalMailboxId={selectedMailbox}
              autoloadNonce={orderAutoloadNonce}
              showCapturedOrders
            />
          </article>
        )}

        {selectedAgent !== "order-capture" && workspaceRoute && (
          <article className="card" style={{ marginTop: 12 }}>
            <div className="label">{selectedAgentName} Workspace</div>
            <p className="muted-note">This workspace will be rendered directly in-page as part of the next step.</p>
          </article>
        )}

        {selectedAgent === "order-validation" && (
          <article className="card" style={{ marginTop: 12 }}>
            <div className="label">Order Validation Agent Workspace</div>
            <OrderValidationWorkspace />
          </article>
        )}

        {selectedAgent === "order-capture-edi" && (
          <article className="card" style={{ marginTop: 12 }}>
            <div className="label">Order Capture - EDI Workspace</div>
            <EdiOrderCaptureWorkspace />
          </article>
        )}

        {selectedAgent === "credit-risk" && (
          <article className="card" style={{ marginTop: 12 }}>
            <div className="label">Credit Risk Agent Workspace</div>
            <CreditRiskWorkspace />
          </article>
        )}

        {selectedAgent === "hold-resolution" && (
          <article className="card" style={{ marginTop: 12 }}>
            <div className="label">Hold Resolution Agent Workspace</div>
            <HoldResolutionWorkspace />
          </article>
        )}

        {selectedAgent === "inventory-allocation" && (
          <article className="card" style={{ marginTop: 12 }}>
            <div className="label">Inventory & Allocation Agent Workspace</div>
            <InventoryAllocationWorkspace />
          </article>
        )}

        {selectedAgent === "shipment-planning" && (
          <article className="card" style={{ marginTop: 12 }}>
            <div className="label">Shipment Planning Agent Workspace</div>
            <SequentialReviewWorkspace
              title="Shipment Planning"
              queueLabel="Orders Ready For Shipment Planning"
              sourceEndpoint="/api/orders/shipment-planning-queue"
              runEndpoint="/api/agents/shipment-planning/run-one"
              actionEndpoint="/api/agents/shipment-planning/action"
              idField="capture_id"
              runButtonLabel="Run Shipment Planning Agent"
              columns={[
                { key: "capture_id", label: "Capture" },
                { key: "customer_name", label: "Customer" },
                { key: "total_amount", label: "Total" },
                { key: "requested_date", label: "Requested Date" },
              ]}
              actionOptions={(result) => [
                { label: "Approve Shipment Plan", decision: result.recommended_decision },
                { label: "Escalate to Manual Review", decision: "manual_review", secondary: true },
              ]}
            />
          </article>
        )}

        {selectedAgent === "billing-intelligence" && (
          <article className="card" style={{ marginTop: 12 }}>
            <div className="label">Billing Intelligence Agent Workspace</div>
            <SequentialReviewWorkspace
              title="Billing Intelligence"
              queueLabel="Orders Ready For Billing Review"
              sourceEndpoint="/api/orders/billing-queue"
              runEndpoint="/api/agents/billing-intelligence/run-one"
              actionEndpoint="/api/agents/billing-intelligence/action"
              idField="capture_id"
              runButtonLabel="Run Billing Intelligence Agent"
              columns={[
                { key: "capture_id", label: "Capture" },
                { key: "customer_name", label: "Customer" },
                { key: "total_amount", label: "Total" },
                { key: "allocation_release_status", label: "Release Status" },
              ]}
              actionOptions={(result) => [
                { label: "Approve Billing Decision", decision: result.recommended_decision },
                { label: "Hold for Review", decision: "hold_for_review", secondary: true },
              ]}
            />
          </article>
        )}

        {selectedAgent === "invoice-matching" && (
          <article className="card" style={{ marginTop: 12 }}>
            <div className="label">Invoice Matching Agent Workspace</div>
            <SequentialReviewWorkspace
              title="Invoice Matching"
              queueLabel="Invoices For 3-Way Match"
              sourceEndpoint="/api/invoices/matching-queue"
              runEndpoint="/api/agents/invoice-matching/run-one"
              actionEndpoint="/api/agents/invoice-matching/action"
              idField="invoice_id"
              runButtonLabel="Run Invoice Matching Agent"
              columns={[
                { key: "invoice_id", label: "Invoice" },
                { key: "capture_id", label: "Capture" },
                { key: "customer_id", label: "Customer" },
                { key: "amount_total", label: "Amount" },
                { key: "amount_open", label: "Open" },
              ]}
              actionOptions={(result) => [
                { label: "Approve Match Decision", decision: result.recommended_decision },
                { label: "Block Invoice", decision: "block_invoice", secondary: true },
              ]}
            />
          </article>
        )}

        {selectedAgent === "payment-prediction" && (
          <article className="card" style={{ marginTop: 12 }}>
            <div className="label">Payment Prediction Agent Workspace</div>
            <SequentialReviewWorkspace
              title="Payment Prediction"
              queueLabel="Customers For Payment Prediction"
              sourceEndpoint="/api/customers/payment-prediction-queue"
              runEndpoint="/api/agents/payment-prediction/run-one"
              actionEndpoint="/api/agents/payment-prediction/action"
              idField="customer_id"
              runButtonLabel="Run Payment Prediction Agent"
              columns={[
                { key: "customer_id", label: "Customer ID" },
                { key: "name", label: "Name" },
                { key: "payment_terms_days", label: "Terms" },
                { key: "risk_score", label: "Risk" },
              ]}
              actionOptions={(result) => [
                { label: "Accept Prediction", decision: result.recommended_decision },
                { label: "Escalate Account Review", decision: "escalate", secondary: true },
              ]}
            />
          </article>
        )}

        {selectedAgent === "collections-communications" && (
          <article className="card" style={{ marginTop: 12 }}>
            <div className="label">Collections Communications Agent Workspace</div>
            <SequentialReviewWorkspace
              title="Collections Communications"
              queueLabel="Collections Actions For Outreach"
              sourceEndpoint="/api/collections/communications-queue"
              runEndpoint="/api/agents/collections-communications/run-one"
              actionEndpoint="/api/agents/collections-communications/action"
              idField="invoice_id"
              runButtonLabel="Run Collections Communications Agent"
              columns={[
                { key: "invoice_id", label: "Invoice" },
                { key: "capture_id", label: "Capture" },
                { key: "customer_id", label: "Customer" },
                { key: "action_type", label: "Strategy Action" },
                { key: "status", label: "Status" },
              ]}
              actionOptions={() => [
                { label: "Approve and Send", decision: "send" },
                { label: "Revise Message", decision: "revise", secondary: true },
              ]}
            />
          </article>
        )}

        {selectedAgent === "collections-strategy" && (
          <article className="card" style={{ marginTop: 12 }}>
            <div className="label">Collections Strategy Agent Workspace</div>
            <SequentialReviewWorkspace
              title="Collections Strategy"
              queueLabel="Invoices In Collections Scope"
              sourceEndpoint="/api/collections/strategy-queue"
              runEndpoint="/api/agents/collections-strategy"
              actionEndpoint="/api/agents/collections-strategy/action"
              idField="invoice_id"
              runButtonLabel="Run Collections Strategy Agent"
              requestBody={(row) => ({ invoice_id: String(row.invoice_id ?? ""), date: new Date().toISOString().slice(0, 10) })}
              columns={[
                { key: "invoice_id", label: "Invoice" },
                { key: "capture_id", label: "Capture" },
                { key: "customer_name", label: "Customer" },
                { key: "amount_open", label: "Open Amount" },
                { key: "days_past_due", label: "Days Past Due" },
              ]}
              actionOptions={(result) => [
                { label: "Approve Outreach Plan", decision: result.recommended_decision },
                { label: "Defer / Review Later", decision: "defer", secondary: true },
              ]}
            />
          </article>
        )}

        {selectedAgent === "cash-application" && (
          <article className="card" style={{ marginTop: 12 }}>
            <div className="label">Cash Application Agent Workspace</div>
            <SequentialReviewWorkspace
              title="Cash Application"
              queueLabel="Customers With Unapplied Cash"
              sourceEndpoint="/api/customers/cash-application-queue"
              runEndpoint="/api/agents/cash-application"
              actionEndpoint="/api/agents/cash-application/apply"
              idField="customer_id"
              runButtonLabel="Run Cash Application Agent"
              requestBody={(row) => ({ customer_id: String(row.customer_id ?? "") })}
              actionBody={(result) => ({
                customer_id: result.subject_id,
                allocations: Array.isArray(result.payload.allocations) ? result.payload.allocations : [],
              })}
              resultTitle={(result) => {
                const total = typeof result.payload.total_unapplied_cash === "number" ? result.payload.total_unapplied_cash : null;
                return total !== null
                  ? `${result.subject_id} | Unapplied Cash: $${total.toFixed(2)}`
                  : `${result.subject_id} | Unapplied Cash`;
              }}
              resultSubtitle={() => "See application details"}
              resultTone={(result) => {
                const total = typeof result.payload.total_unapplied_cash === "number" ? result.payload.total_unapplied_cash : 0;
                if (total >= 20000) return "red";
                if (total <= 7500) return "green";
                return "amber";
              }}
              columns={[
                { key: "customer_id", label: "Customer" },
                { key: "customer_name", label: "Name" },
                { key: "unapplied_payment_count", label: "Payments" },
                { key: "open_invoice_count", label: "Invoices" },
                { key: "unapplied_cash_total", label: "Unapplied Cash" },
                { key: "open_ar_total", label: "Open AR" },
              ]}
              actionOptions={() => [{ label: "Approve and Apply", decision: "apply" }]}
            />
          </article>
        )}

        {selectedAgent === "dispute-triage-resolution" && (
          <article className="card" style={{ marginTop: 12 }}>
            <div className="label">Dispute Triage & Resolution Agent Workspace</div>
            <SequentialReviewWorkspace
              title="Dispute Triage"
              queueLabel="Open Disputes"
              sourceEndpoint="/api/disputes/open"
              runEndpoint="/api/agents/dispute-triage"
              actionEndpoint="/api/agents/dispute-triage/action"
              idField="dispute_id"
              runButtonLabel="Run Dispute Triage Agent"
              columns={[
                { key: "dispute_id", label: "Dispute" },
                { key: "capture_id", label: "Capture" },
                { key: "invoice_id", label: "Invoice" },
                { key: "amount_at_risk", label: "Amount at Risk" },
                { key: "status", label: "Status" },
              ]}
              actionOptions={() => [
                { label: "Mark In Review", decision: "in_review" },
                { label: "Resolve Dispute", decision: "resolve", secondary: true },
              ]}
            />
          </article>
        )}
      </div>
    </section>
  );
}

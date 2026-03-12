import { NextResponse } from "next/server";
import { AGENT_CATALOG } from "@/lib/agents/catalog";
import {
  getCreditRiskKpis,
  getHoldResolutionKpis,
  getInsightAgentKpis,
  getInventoryAllocationKpis,
  getKpis,
  getOrderCaptureKpis,
  getOrderValidationKpis,
  getWorkflowAgentKpis,
} from "@/lib/db/dao";
import type { AgentKpiSummary } from "@/lib/types";

export const runtime = "nodejs";

function plannedSummary(agent: (typeof AGENT_CATALOG)[number]): AgentKpiSummary {
  return {
    agent_id: agent.id,
    agent_name: agent.name,
    stage: "planned",
    primary_responsibilities: agent.primaryResponsibilities,
    kpis: agent.kpiLabels.map((label, idx) => ({
      key: `${agent.id}-${idx + 1}`,
      label,
      value: null,
      unit: "count",
    })),
  };
}

export async function GET() {
  const [
    core,
    orderCapture,
    orderValidation,
    creditRisk,
    holdResolution,
    inventoryAllocation,
    orchestratorKpis,
    shipmentKpis,
    billingKpis,
    matchingKpis,
    paymentPredictionKpis,
    communicationsKpis,
    workingCapitalKpis,
    processMiningKpis,
    complianceKpis,
  ] = await Promise.all([
    getKpis(),
    getOrderCaptureKpis(),
    getOrderValidationKpis(),
    getCreditRiskKpis(),
    getHoldResolutionKpis(),
    getInventoryAllocationKpis(),
    getWorkflowAgentKpis("o2c-orchestrator"),
    getWorkflowAgentKpis("shipment-planning"),
    getWorkflowAgentKpis("billing-intelligence"),
    getWorkflowAgentKpis("invoice-matching"),
    getWorkflowAgentKpis("payment-prediction"),
    getWorkflowAgentKpis("collections-communications"),
    getInsightAgentKpis("working-capital-intelligence"),
    getInsightAgentKpis("process-mining"),
    getInsightAgentKpis("compliance-audit"),
  ]);

  const rows = AGENT_CATALOG.map<AgentKpiSummary>((agent) => {
    if (agent.id === "order-capture") {
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        stage: "implemented",
        primary_responsibilities: agent.primaryResponsibilities,
        kpis: [
          {
            key: "order-entry-time-reduction",
            label: "Order entry time reduction %",
            value: orderCapture.order_entry_time_reduction_rate,
            unit: "percent",
          },
          { key: "order-accuracy", label: "Order accuracy", value: orderCapture.order_accuracy, unit: "percent" },
          { key: "order-stp-rate", label: "STP rate", value: orderCapture.stp_rate, unit: "percent" },
          { key: "captured-orders", label: "Captured orders", value: orderCapture.captured_orders, unit: "count" },
        ],
      };
    }

    if (agent.id === "cash-application") {
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        stage: "implemented",
        primary_responsibilities: agent.primaryResponsibilities,
        kpis: [
          { key: "auto-match-rate", label: "Auto-match rate", value: core.auto_match_rate, unit: "percent" },
          { key: "unapplied-cash", label: "Unapplied cash", value: core.unapplied_cash, unit: "currency" },
          { key: "cost-per-payment", label: "Cost per payment", value: null, unit: "currency" },
        ],
      };
    }

    if (agent.id === "order-validation") {
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        stage: "implemented",
        primary_responsibilities: agent.primaryResponsibilities,
        kpis: [
          { key: "order-error-rate", label: "Order error rate", value: orderValidation.order_error_rate, unit: "percent" },
          { key: "pricing-accuracy", label: "Pricing accuracy", value: orderValidation.pricing_accuracy, unit: "percent" },
          { key: "fulfillment-accuracy", label: "Fulfillment accuracy", value: orderValidation.fulfillment_accuracy, unit: "percent" },
        ],
      };
    }

    if (agent.id === "credit-risk") {
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        stage: "implemented",
        primary_responsibilities: agent.primaryResponsibilities,
        kpis: [
          {
            key: "bad-debt-proxy",
            label: "Bad debt %",
            value: creditRisk.bad_debt_proxy_rate,
            unit: "percent",
          },
          {
            key: "credit-approval-time",
            label: "Credit approval time",
            value: creditRisk.credit_approval_time_minutes,
            unit: "minutes",
          },
          {
            key: "revenue-at-risk",
            label: "Revenue at risk",
            value: creditRisk.revenue_at_risk,
            unit: "currency",
          },
        ],
      };
    }

    if (agent.id === "collections-strategy") {
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        stage: "implemented",
        primary_responsibilities: agent.primaryResponsibilities,
        kpis: [
          { key: "dso", label: "DSO", value: core.dso_proxy, unit: "days" },
          { key: "cei", label: "CEI", value: null, unit: "percent" },
          { key: "promise-to-pay-kept", label: "Promise-to-pay kept rate", value: null, unit: "percent" },
        ],
      };
    }

    if (agent.id === "hold-resolution") {
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        stage: "implemented",
        primary_responsibilities: agent.primaryResponsibilities,
        kpis: [
          { key: "hold-duration", label: "Hold duration", value: holdResolution.hold_duration_days, unit: "days" },
          { key: "revenue-delay", label: "Revenue delay", value: holdResolution.revenue_delay, unit: "currency" },
          { key: "manual-touches", label: "Manual touches", value: holdResolution.manual_touches, unit: "count" },
        ],
      };
    }

    if (agent.id === "inventory-allocation") {
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        stage: "implemented",
        primary_responsibilities: agent.primaryResponsibilities,
        kpis: [
          { key: "fill-rate", label: "Fill rate", value: inventoryAllocation.fill_rate, unit: "percent" },
          { key: "stockout-rate", label: "Stockout rate", value: inventoryAllocation.stockout_rate, unit: "percent" },
          { key: "backorder-age", label: "Backorder age", value: inventoryAllocation.backorder_age_days, unit: "days" },
        ],
      };
    }

    if (agent.id === "shipment-planning") {
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        stage: "implemented",
        primary_responsibilities: agent.primaryResponsibilities,
        kpis: [
          { key: "shipment-actions", label: "Shipment plans", value: shipmentKpis.action_count, unit: "count" },
          { key: "shipment-exceptions", label: "Shipment exception rate", value: shipmentKpis.exception_rate, unit: "percent" },
          { key: "shipment-cycle", label: "Planning cycle proxy", value: shipmentKpis.avg_cycle_proxy, unit: "days" },
        ],
      };
    }

    if (agent.id === "billing-intelligence") {
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        stage: "implemented",
        primary_responsibilities: agent.primaryResponsibilities,
        kpis: [
          { key: "billing-actions", label: "Billing runs", value: billingKpis.action_count, unit: "count" },
          { key: "billing-exceptions", label: "Billing exception rate", value: billingKpis.exception_rate, unit: "percent" },
          { key: "billing-cycle", label: "Invoice cycle proxy", value: billingKpis.avg_cycle_proxy, unit: "days" },
        ],
      };
    }

    if (agent.id === "invoice-matching") {
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        stage: "implemented",
        primary_responsibilities: agent.primaryResponsibilities,
        kpis: [
          { key: "match-actions", label: "Match runs", value: matchingKpis.action_count, unit: "count" },
          { key: "match-exceptions", label: "Match exception rate", value: matchingKpis.exception_rate, unit: "percent" },
          { key: "match-cycle", label: "Rework proxy", value: matchingKpis.avg_cycle_proxy, unit: "days" },
        ],
      };
    }

    if (agent.id === "payment-prediction") {
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        stage: "implemented",
        primary_responsibilities: agent.primaryResponsibilities,
        kpis: [
          { key: "prediction-actions", label: "Predictions", value: paymentPredictionKpis.action_count, unit: "count" },
          { key: "late-risk-rate", label: "Late-risk exception rate", value: paymentPredictionKpis.exception_rate, unit: "percent" },
          { key: "forecast-cycle", label: "Forecast refresh proxy", value: paymentPredictionKpis.avg_cycle_proxy, unit: "days" },
        ],
      };
    }

    if (agent.id === "collections-communications") {
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        stage: "implemented",
        primary_responsibilities: agent.primaryResponsibilities,
        kpis: [
          { key: "comm-actions", label: "Messages generated", value: communicationsKpis.action_count, unit: "count" },
          { key: "comm-exceptions", label: "Communication exception rate", value: communicationsKpis.exception_rate, unit: "percent" },
          { key: "comm-cycle", label: "Response cycle proxy", value: communicationsKpis.avg_cycle_proxy, unit: "days" },
        ],
      };
    }

    if (agent.id === "dispute-triage-resolution") {
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        stage: "implemented",
        primary_responsibilities: agent.primaryResponsibilities,
        kpis: [
          { key: "dispute-rate", label: "Dispute rate", value: core.dispute_rate, unit: "percent" },
          { key: "dispute-resolution-time", label: "Dispute resolution time", value: null, unit: "days" },
          { key: "reopen-rate", label: "Reopen rate", value: null, unit: "percent" },
        ],
      };
    }

    if (agent.id === "working-capital-intelligence") {
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        stage: "implemented",
        primary_responsibilities: agent.primaryResponsibilities,
        kpis: [
          { key: "wci-findings", label: "Insights", value: workingCapitalKpis.finding_count, unit: "count" },
          { key: "wci-high", label: "High-severity rate", value: workingCapitalKpis.high_severity_rate, unit: "percent" },
          { key: "wci-impact", label: "Impact proxy", value: workingCapitalKpis.impact_proxy, unit: "count" },
        ],
      };
    }

    if (agent.id === "process-mining") {
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        stage: "implemented",
        primary_responsibilities: agent.primaryResponsibilities,
        kpis: [
          { key: "pm-findings", label: "Bottlenecks found", value: processMiningKpis.finding_count, unit: "count" },
          { key: "pm-high", label: "High-severity rate", value: processMiningKpis.high_severity_rate, unit: "percent" },
          { key: "pm-impact", label: "Impact proxy", value: processMiningKpis.impact_proxy, unit: "count" },
        ],
      };
    }

    if (agent.id === "compliance-audit") {
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        stage: "implemented",
        primary_responsibilities: agent.primaryResponsibilities,
        kpis: [
          { key: "audit-findings", label: "Audit findings", value: complianceKpis.finding_count, unit: "count" },
          { key: "audit-high", label: "High-severity rate", value: complianceKpis.high_severity_rate, unit: "percent" },
          { key: "audit-impact", label: "Control impact proxy", value: complianceKpis.impact_proxy, unit: "count" },
        ],
      };
    }

    if (agent.id === "o2c-orchestrator") {
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        stage: "implemented",
        primary_responsibilities: agent.primaryResponsibilities,
        kpis: [
          { key: "orc-actions", label: "Routing decisions", value: orchestratorKpis.action_count, unit: "count" },
          { key: "orc-exceptions", label: "Exception rate", value: orchestratorKpis.exception_rate, unit: "percent" },
          { key: "orc-cycle", label: "SLA proxy", value: orchestratorKpis.avg_cycle_proxy, unit: "days" },
        ],
      };
    }

    return plannedSummary(agent);
  });

  return NextResponse.json({
    as_of: new Date().toISOString(),
    agents: rows,
  });
}

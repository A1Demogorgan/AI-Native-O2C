import { NextResponse } from "next/server";
import { z } from "zod";
import { runBillingIntelligenceAgent } from "@/lib/agents/billingIntelligenceAgent";
import { getLatestWorkflowAgentAction, listBillingQueueOrders } from "@/lib/db/dao";
import type { ReviewAgentResult, ShipmentPlanningProposal } from "@/lib/types";

export const runtime = "nodejs";

const schema = z.object({ capture_id: z.string().min(1) });

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  const order = (await listBillingQueueOrders(200)).find((row) => row.capture_id === body.capture_id);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const shipment = await getLatestWorkflowAgentAction("shipment-planning", "order", order.capture_id);
  const shipmentPayload = shipment ? (JSON.parse(shipment.payload_json) as ShipmentPlanningProposal) : null;
  const proposal = runBillingIntelligenceAgent({
    capture_id: order.capture_id,
    total_amount: Number(order.total_amount),
    planned_ship_date: shipmentPayload?.planned_ship_date ?? order.requested_date,
    plan_status: shipmentPayload?.plan_status,
  });

  const review: ReviewAgentResult = {
    subject_id: order.capture_id,
    action_title: proposal.billing_status === "ready_to_invoice" ? "Release invoice creation" : "Billing hold decision",
    action_summary: proposal.summary,
    recommended_decision: proposal.billing_status,
    facts: [
      { label: "Customer", value: order.customer_name },
      { label: "Invoice amount", value: `$${Number(proposal.invoice_amount).toFixed(2)}` },
      { label: "Billing date", value: proposal.billing_date ?? "TBD" },
      { label: "Shipment plan", value: shipmentPayload?.plan_status ?? "Unknown" },
    ],
    insights: proposal.anomalies.length > 0 ? proposal.anomalies : ["No billing anomalies detected."],
    payload: proposal as unknown as Record<string, unknown>,
  };

  return NextResponse.json({ review });
}

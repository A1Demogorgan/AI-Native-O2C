import { NextResponse } from "next/server";
import { z } from "zod";
import { runShipmentPlanningAgent } from "@/lib/agents/shipmentPlanningAgent";
import { getLatestInventoryAllocationAction, listShipmentPlanningQueueOrders } from "@/lib/db/dao";
import type { ReviewAgentResult } from "@/lib/types";

export const runtime = "nodejs";

const schema = z.object({ capture_id: z.string().min(1) });

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  const order = (await listShipmentPlanningQueueOrders(200)).find((row) => row.capture_id === body.capture_id);
  if (!order) {
    return NextResponse.json({ error: "Allocation-eligible order not found" }, { status: 404 });
  }

  const allocation = await getLatestInventoryAllocationAction(order.capture_id);
  const proposal = runShipmentPlanningAgent({
    capture_id: order.capture_id,
    requested_date: order.requested_date,
    allocation_summary: allocation?.summary,
    allocation_lines_json: allocation?.line_results_json,
  });

  const review: ReviewAgentResult = {
    subject_id: order.capture_id,
    action_title: proposal.plan_status === "split_required" ? "Split shipment required" : "Shipment plan ready for approval",
    action_summary: proposal.summary,
    recommended_decision: proposal.plan_status,
    facts: [
      { label: "Customer", value: order.customer_name },
      { label: "Requested date", value: order.requested_date },
      { label: "Planned ship date", value: proposal.planned_ship_date ?? "TBD" },
      { label: "Estimated delivery", value: proposal.estimated_delivery_date ?? "TBD" },
      { label: "Ship from", value: proposal.ship_from.join(", ") || "TBD" },
      { label: "Carrier strategy", value: proposal.carrier_strategy },
    ],
    insights: proposal.milestones,
    payload: proposal as unknown as Record<string, unknown>,
  };

  return NextResponse.json({ review });
}

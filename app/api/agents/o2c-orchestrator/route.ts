import { NextResponse } from "next/server";
import { runO2COrchestratorAgent } from "@/lib/agents/o2cOrchestratorAgent";
import { createWorkflowAgentAction, listCollectionsActions, listDisputes, listHeldOrders, listPayments } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const [heldOrders, disputes, payments, collectionActions] = await Promise.all([
    listHeldOrders(50),
    listDisputes(50),
    listPayments(50),
    listCollectionsActions(50),
  ]);

  const recommendations = runO2COrchestratorAgent({
    held_order_ids: heldOrders.map((row) => row.capture_id),
    disputed_invoice_ids: disputes.map((row) => row.invoice_id),
    unapplied_payment_ids: payments.filter((row) => Number(row.amount_unapplied) > 0).map((row) => row.payment_id),
    open_collection_action_ids: collectionActions.filter((row) => row.status !== "resolved").map((row) => row.action_id),
  });

  await Promise.all(
    recommendations.map((rec) =>
      createWorkflowAgentAction({
        agent_id: "o2c-orchestrator",
        subject_type: rec.work_item_type,
        subject_id: rec.entity_id,
        recommended_decision: rec.next_agent,
        final_decision: rec.next_agent,
        summary: rec.summary,
        payload_json: JSON.stringify(rec),
        actor: "o2c-orchestrator-agent",
      }),
    ),
  );

  return NextResponse.json({ recommendations });
}

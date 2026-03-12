import { NextResponse } from "next/server";
import { runProcessMiningAgent } from "@/lib/agents/processMiningAgent";
import { createAgentInsight, getKpis, listCollectionsActions, listDisputes, listHeldOrders } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const [kpis, heldOrders, disputes, collections] = await Promise.all([
    getKpis(),
    listHeldOrders(200),
    listDisputes(500),
    listCollectionsActions(500),
  ]);

  const insights = runProcessMiningAgent({
    held_orders: heldOrders.length,
    open_disputes: disputes.length,
    open_collections: collections.filter((item) => item.status !== "resolved").length,
    unapplied_payments: kpis.unapplied_cash,
  });

  await Promise.all(
    insights.map((insight) =>
      createAgentInsight({
        agent_id: "process-mining",
        insight_type: insight.bottleneck_stage,
        subject_id: "workflow",
        severity: insight.severity,
        title: insight.bottleneck_stage,
        summary: insight.summary,
        payload_json: JSON.stringify(insight),
        actor: "process-mining-agent",
      }),
    ),
  );

  return NextResponse.json({ insights });
}

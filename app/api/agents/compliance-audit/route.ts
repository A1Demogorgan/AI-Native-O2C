import { NextResponse } from "next/server";
import { runComplianceAuditAgent } from "@/lib/agents/complianceAuditAgent";
import {
  createAgentInsight,
  listCreditRiskActions,
  listHeldOrders,
  listHoldResolutionActions,
  listInventoryAllocationActions,
} from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const [creditActions, heldOrders, inventoryActions, holdActions] = await Promise.all([
    listCreditRiskActions(500),
    listHeldOrders(200),
    listInventoryAllocationActions(500),
    listHoldResolutionActions(500),
  ]);

  const insights = runComplianceAuditAgent({
    credit_overrides: creditActions.filter((row) => row.final_decision !== row.recommended_decision).length,
    holds_without_resolution: Math.max(0, heldOrders.length - holdActions.length),
    inventory_exceptions: inventoryActions.filter((row) => ["escalate", "backorder"].includes(row.recommended_decision)).length,
  });

  await Promise.all(
    insights.map((insight) =>
      createAgentInsight({
        agent_id: "compliance-audit",
        insight_type: insight.control_area,
        subject_id: "controls",
        severity: insight.severity,
        title: insight.control_area,
        summary: insight.summary,
        payload_json: JSON.stringify(insight),
        actor: "compliance-audit-agent",
      }),
    ),
  );

  return NextResponse.json({ insights });
}

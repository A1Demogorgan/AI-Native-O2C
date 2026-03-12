import { NextResponse } from "next/server";
import { runWorkingCapitalIntelligenceAgent } from "@/lib/agents/workingCapitalIntelligenceAgent";
import { createAgentInsight, getKpis, listCollectionsActions, listDisputes } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const [kpis, disputes, collections] = await Promise.all([getKpis(), listDisputes(500), listCollectionsActions(500)]);
  const insights = runWorkingCapitalIntelligenceAgent({
    kpis,
    open_disputes: disputes.length,
    open_collections: collections.filter((item) => item.status !== "resolved").length,
  });

  await Promise.all(
    insights.map((insight) =>
      createAgentInsight({
        agent_id: "working-capital-intelligence",
        insight_type: insight.insight_type,
        subject_id: "portfolio",
        severity: insight.severity,
        title: insight.title,
        summary: insight.summary,
        payload_json: JSON.stringify(insight),
        actor: "working-capital-intelligence-agent",
      }),
    ),
  );

  return NextResponse.json({ insights });
}

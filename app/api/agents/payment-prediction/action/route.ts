import { NextResponse } from "next/server";
import { z } from "zod";
import { createWorkflowAgentAction } from "@/lib/db/dao";

export const runtime = "nodejs";

const schema = z.object({
  customer_id: z.string().min(1),
  final_decision: z.string().min(1),
  proposal: z.record(z.string(), z.unknown()),
});

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  await createWorkflowAgentAction({
    agent_id: "payment-prediction",
    subject_type: "customer",
    subject_id: body.customer_id,
    recommended_decision: String(body.proposal.late_risk ?? body.final_decision),
    final_decision: body.final_decision,
    summary: `Payment prediction reviewed for ${body.customer_id}.`,
    payload_json: JSON.stringify(body.proposal),
    actor: "payment-prediction-review",
  });

  return NextResponse.json({ ok: true });
}

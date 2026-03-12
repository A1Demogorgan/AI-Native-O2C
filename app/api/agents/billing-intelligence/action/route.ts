import { NextResponse } from "next/server";
import { z } from "zod";
import { createWorkflowAgentAction } from "@/lib/db/dao";

export const runtime = "nodejs";

const schema = z.object({
  capture_id: z.string().min(1),
  final_decision: z.string().min(1),
  proposal: z.record(z.string(), z.unknown()),
});

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  await createWorkflowAgentAction({
    agent_id: "billing-intelligence",
    subject_type: "order",
    subject_id: body.capture_id,
    recommended_decision: String(body.proposal.billing_status ?? body.final_decision),
    final_decision: body.final_decision,
    summary: String(body.proposal.summary ?? "Billing recommendation reviewed."),
    payload_json: JSON.stringify(body.proposal),
    actor: "billing-intelligence-review",
  });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { createWorkflowAgentAction } from "@/lib/db/dao";

export const runtime = "nodejs";

const schema = z.object({
  invoice_id: z.string().min(1),
  final_decision: z.string().min(1),
  proposal: z.record(z.string(), z.unknown()),
});

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  await createWorkflowAgentAction({
    agent_id: "collections-communications",
    subject_type: "invoice",
    subject_id: body.invoice_id,
    recommended_decision: String(body.proposal.channel ?? body.final_decision),
    final_decision: body.final_decision,
    summary: String(body.proposal.subject_line ?? "Collections communication reviewed."),
    payload_json: JSON.stringify(body.proposal),
    actor: "collections-communications-review",
  });

  return NextResponse.json({ ok: true });
}

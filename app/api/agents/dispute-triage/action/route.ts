import { NextResponse } from "next/server";
import { z } from "zod";
import { updateDispute } from "@/lib/db/dao";

export const runtime = "nodejs";

const schema = z.object({
  dispute_id: z.string().min(1),
  final_decision: z.string().min(1),
  proposal: z.object({
    dispute_type: z.string(),
    evidence_summary: z.string(),
  }),
});

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  const status = body.final_decision === "resolve" ? "resolved" : "in_review";
  const updated = await updateDispute(body.dispute_id, {
    dispute_type: body.proposal.dispute_type,
    evidence_summary: body.proposal.evidence_summary,
    status,
  });

  return NextResponse.json({ dispute: updated });
}

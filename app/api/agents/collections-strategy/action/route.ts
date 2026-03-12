import { NextResponse } from "next/server";
import { z } from "zod";
import { createCollectionActions } from "@/lib/db/dao";

export const runtime = "nodejs";

const schema = z.object({
  invoice_id: z.string().min(1),
  final_decision: z.string().min(1),
  proposal: z.object({
    customer_id: z.string(),
    action_type: z.string(),
    priority_score: z.number(),
    recommended_message: z.string(),
  }),
});

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  if (body.final_decision === "defer") {
    return NextResponse.json({ ok: true, deferred: true });
  }

  await createCollectionActions({
    items: [
      {
        customer_id: body.proposal.customer_id,
        invoice_id: body.invoice_id,
        action_type: body.final_decision,
        priority_score: body.proposal.priority_score,
        recommended_message: body.proposal.recommended_message,
      },
    ],
    created_by: "collections-strategy-review",
  });

  return NextResponse.json({ ok: true });
}

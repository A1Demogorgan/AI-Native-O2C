import { NextResponse } from "next/server";
import { z } from "zod";
import { createCreditRiskAction, setCapturedOrderReviewFlag } from "@/lib/db/dao";

export const runtime = "nodejs";

const schema = z.object({
  capture_id: z.string().min(1),
  recommended_decision: z.enum(["approve", "conditional", "hold"]),
  final_decision: z.enum(["approve", "conditional", "hold", "escalate"]),
  risk_score: z.number().min(0).max(100),
  revenue_at_risk: z.number().min(0),
  bad_debt_delta: z.number().min(0),
  rationale: z.array(z.string()).default([]),
  override_reason: z.string().optional(),
});

export async function POST(req: Request) {
  const body = schema.parse(await req.json());

  await createCreditRiskAction({
    capture_id: body.capture_id,
    recommended_decision: body.recommended_decision,
    final_decision: body.final_decision,
    risk_score: body.risk_score,
    revenue_at_risk: body.revenue_at_risk,
    bad_debt_delta: body.bad_debt_delta,
    rationale: body.rationale,
    override_reason: body.override_reason,
    actor: "credit-risk-human-action",
  });

  await setCapturedOrderReviewFlag({
    capture_id: body.capture_id,
    requires_review: body.final_decision === "hold" || body.final_decision === "escalate",
    actor: "credit-risk-human-action",
  });

  return NextResponse.json({ ok: true });
}

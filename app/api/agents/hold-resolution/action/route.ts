import { NextResponse } from "next/server";
import { z } from "zod";
import { createHoldResolutionAction } from "@/lib/db/dao";

export const runtime = "nodejs";

const schema = z.object({
  capture_id: z.string().min(1),
  recommended_decision: z.enum(["release", "conditional_release", "escalate"]),
  final_decision: z.enum(["release", "conditional_release", "escalate", "keep_on_hold"]),
  owner_team: z.string().min(1),
  resolution_summary: z.string().min(1),
});

export async function POST(req: Request) {
  const body = schema.parse(await req.json());

  await createHoldResolutionAction({
    capture_id: body.capture_id,
    recommended_decision: body.recommended_decision,
    final_decision: body.final_decision,
    owner_team: body.owner_team,
    resolution_summary: body.resolution_summary,
    actor: "hold-resolution-human-action",
  });

  return NextResponse.json({ ok: true });
}

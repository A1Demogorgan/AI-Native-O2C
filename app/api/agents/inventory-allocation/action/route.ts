import { NextResponse } from "next/server";
import { z } from "zod";
import { createInventoryAllocationAction } from "@/lib/db/dao";

export const runtime = "nodejs";

const lineSchema = z.object({
  sku: z.string(),
  ordered_qty: z.number().nonnegative(),
  allocated_qty: z.number().nonnegative(),
  backordered_qty: z.number().nonnegative(),
  status: z.enum(["allocated", "partial", "substituted", "backordered", "escalated"]),
  source_location: z.string().nullable(),
  substitute_sku: z.string().nullable(),
  proposed_ship_date: z.string().nullable(),
  rationale: z.string(),
});

const schema = z.object({
  capture_id: z.string().min(1),
  recommended_decision: z.enum(["allocate_full", "allocate_partial", "substitute", "split_shipment", "backorder", "escalate"]),
  final_decision: z.enum(["accepted", "allocate_full", "allocate_partial", "substitute", "split_shipment", "backorder", "escalate"]),
  fill_rate: z.number().min(0).max(1),
  revenue_at_risk: z.number().min(0),
  summary: z.string(),
  lines: z.array(lineSchema),
});

export async function POST(req: Request) {
  const body = schema.parse(await req.json());

  await createInventoryAllocationAction({
    capture_id: body.capture_id,
    recommended_decision: body.recommended_decision,
    final_decision: body.final_decision,
    fill_rate: body.fill_rate,
    revenue_at_risk: body.revenue_at_risk,
    summary: body.summary,
    line_results_json: JSON.stringify(body.lines),
    actor: "inventory-allocation-human-action",
  });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createOrderValidationAction,
  getCapturedOrder,
  updateCapturedOrderForValidation,
} from "@/lib/db/dao";
import type { OrderValidationDiscrepancy } from "@/lib/types";

export const runtime = "nodejs";

const lineItemSchema = z.object({
  sku: z.string(),
  quantity: z.number().positive(),
  unit_price: z.number().positive(),
});

const draftSchema = z.object({
  customer_name: z.string().min(1),
  customer_email: z.string().email(),
  po_number: z.string().min(1),
  requested_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ship_to: z.string().min(1),
  currency: z.string().min(3),
  total_amount: z.number().positive(),
  line_items: z.array(lineItemSchema).min(1),
});

const discrepancySchema = z.object({
  field: z.string(),
  issue: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  from_value: z.string(),
  to_value: z.string(),
  reason: z.string(),
});

const schema = z.object({
  capture_id: z.string().min(1),
  action: z.enum(["accept", "reject", "decline"]),
  original: draftSchema,
  proposed: draftSchema,
  discrepancies: z.array(discrepancySchema).default([]),
});

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  const current = await getCapturedOrder(body.capture_id);
  if (!current) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (body.action === "accept") {
    await updateCapturedOrderForValidation({
      capture_id: body.capture_id,
      ...body.proposed,
      requires_review: false,
      actor: "order-validation-human-accepted",
    });
  }

  if (body.action === "decline") {
    await updateCapturedOrderForValidation({
      capture_id: body.capture_id,
      customer_name: current.customer_name,
      customer_email: current.customer_email,
      po_number: current.po_number,
      requested_date: current.requested_date,
      ship_to: current.ship_to,
      currency: current.currency,
      total_amount: current.total_amount,
      line_items: JSON.parse(current.line_items_json),
      requires_review: true,
      actor: "order-validation-human-declined",
    });
  }

  await createOrderValidationAction({
    capture_id: body.capture_id,
    action: body.action,
    original: body.original,
    proposed: body.proposed,
    discrepancies: body.discrepancies as OrderValidationDiscrepancy[],
    actor: `order-validation-${body.action}`,
  });

  const updated = await getCapturedOrder(body.capture_id);
  return NextResponse.json({ order: updated });
}

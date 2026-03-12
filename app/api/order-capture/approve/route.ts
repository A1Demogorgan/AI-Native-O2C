import { NextResponse } from "next/server";
import { z } from "zod";
import { createCapturedOrder } from "@/lib/db/dao";

const lineItemSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().positive(),
  unit_price: z.number().positive(),
});

const schema = z.object({
  mailbox_id: z.string().default("chat-session"),
  message_id: z.string().default("chat-message"),
  source: z.enum(["email", "chat"]),
  processing_seconds: z.number().nonnegative().optional(),
  validated: z.object({
    customer_name: z.string().min(1),
    customer_email: z.string().email(),
    po_number: z.string().min(1),
    requested_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ship_to: z.string().min(1),
    currency: z.string().min(3),
    total_amount: z.number().positive(),
    extraction_confidence: z.number().min(0).max(1),
    special_notes: z.string().default(""),
    line_items: z.array(lineItemSchema).min(1),
  }),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = schema.parse(await req.json());

  const created = await createCapturedOrder({
    source: body.source,
    customer_name: body.validated.customer_name,
    customer_email: body.validated.customer_email,
    po_number: body.validated.po_number,
    requested_date: body.validated.requested_date,
    ship_to: body.validated.ship_to,
    currency: body.validated.currency.toUpperCase(),
    total_amount: body.validated.total_amount,
    line_items: body.validated.line_items,
    extraction_confidence: body.validated.extraction_confidence,
    requires_review: false,
    processing_seconds: Number(body.processing_seconds ?? 0),
    created_by: body.source === "chat" ? "order-capture-chatbot" : "order-capture-human-approved",
    input_payload: {
      mailbox_id: body.mailbox_id,
      message_id: body.message_id,
      special_notes: body.validated.special_notes,
    },
  });

  return NextResponse.json({ order: created }, { status: 201 });
}

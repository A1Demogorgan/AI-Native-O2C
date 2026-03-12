import { z } from "zod";
import { runWithAgentSdkStrict } from "@/lib/agents/sdk";
import { getOrderCaptureMasterData } from "@/lib/order-capture-fixtures/masterData";
import type { OrderCaptureCorrection, OrderCaptureDraft, OrderLineItem } from "@/lib/types";

const orderSchema = z.object({
  customer_name: z.string().min(1),
  customer_email: z.string().email(),
  po_number: z.string().min(1),
  requested_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ship_to: z.string().min(1),
  currency: z.string().min(3),
  total_amount: z.number().positive(),
  extraction_confidence: z.number().min(0).max(1),
  special_notes: z.string().default(""),
  line_items: z
    .array(
      z.object({
        sku: z.string().min(1),
        quantity: z.number().positive(),
        unit_price: z.number().positive(),
      }),
    )
    .min(1),
});

const outputSchema = z.object({
  submitted_order: orderSchema,
  normalized_order: orderSchema,
  corrections: z
    .array(
      z.object({
        field: z.string().min(1),
        from_value: z.string().default(""),
        to_value: z.string().default(""),
        reason: z.string().default(""),
      }),
    )
    .default([]),
});

type ExtractInput = {
  mailbox_id: string;
  message_id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  attachment_file_name: string;
  attachment_text: string;
};

function normalizeItems(items: OrderLineItem[]) {
  return items.map((item) => ({
    sku: item.sku.trim(),
    quantity: Number(item.quantity),
    unit_price: Number(item.unit_price),
  }));
}

function normalizeDraft(order: z.infer<typeof orderSchema>): OrderCaptureDraft {
  return {
    customer_name: order.customer_name,
    customer_email: order.customer_email,
    po_number: order.po_number,
    requested_date: order.requested_date,
    ship_to: order.ship_to,
    currency: order.currency.toUpperCase(),
    total_amount: Number(order.total_amount),
    extraction_confidence: Number(order.extraction_confidence),
    special_notes: order.special_notes,
    line_items: normalizeItems(order.line_items),
  };
}

export async function extractOrderDraftFromEmailWithRaw(input: ExtractInput): Promise<{
  draft: OrderCaptureDraft;
  submitted_order: OrderCaptureDraft;
  corrections: OrderCaptureCorrection[];
  raw_json: string;
}> {
  const masterData = getOrderCaptureMasterData();

  const systemPrompt = [
    "You are an Order Capture Agent for hospitality mattress orders.",
    "Use email metadata/body and PDF text to extract submitted order details, then normalize to system master data.",
    "Master data includes: customer mapping by sender email and SKU alias mapping old->new.",
    "Return ONLY JSON with keys: submitted_order, normalized_order, corrections.",
    "submitted_order must reflect what was provided in the order content.",
    "normalized_order must correct customer and SKU fields using master data when needed.",
    "corrections must list each changed field with field, from_value, to_value, reason.",
    "Use field paths like customer_name or line_items[0].sku.",
    "Both orders must include: customer_name, customer_email, po_number, requested_date(YYYY-MM-DD), ship_to, currency, total_amount, extraction_confidence, special_notes, line_items[{sku,quantity,unit_price}]",
    "Do not output markdown.",
  ].join(" ");

  const raw = await runWithAgentSdkStrict(
    systemPrompt,
    JSON.stringify({
      email: input,
      master_data: masterData,
    }),
  );

  const parsed = outputSchema.parse(JSON.parse(raw));
  const submitted = normalizeDraft(parsed.submitted_order);
  const normalized = normalizeDraft(parsed.normalized_order);

  return {
    draft: normalized,
    submitted_order: submitted,
    corrections: parsed.corrections.map((c) => ({
      field: c.field,
      from_value: c.from_value,
      to_value: c.to_value,
      reason: c.reason,
    })),
    raw_json: raw,
  };
}

export async function extractOrderDraftFromEmail(input: ExtractInput): Promise<OrderCaptureDraft> {
  const result = await extractOrderDraftFromEmailWithRaw(input);
  return result.draft;
}

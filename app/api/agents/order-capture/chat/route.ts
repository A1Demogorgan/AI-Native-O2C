import { NextResponse } from "next/server";
import { z } from "zod";
import { buildDefaultChatProfile, runOrderCaptureChatTurn } from "@/lib/agents/orderCaptureChatAgent";
import type { OrderCaptureDraft } from "@/lib/types";

export const runtime = "nodejs";

const lineItemSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().positive(),
  unit_price: z.number().positive(),
});

const draftSchema: z.ZodType<Partial<OrderCaptureDraft>> = z.object({
  customer_name: z.string().optional(),
  customer_email: z.string().optional(),
  po_number: z.string().optional(),
  requested_date: z.string().optional(),
  ship_to: z.string().optional(),
  currency: z.string().optional(),
  total_amount: z.number().optional(),
  extraction_confidence: z.number().optional(),
  special_notes: z.string().optional(),
  line_items: z.array(lineItemSchema).optional(),
});

const schema = z.object({
  message: z.string().min(1),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .default([]),
  draft: draftSchema.default({}),
  profile: z
    .object({
      user_name: z.string(),
      user_email: z.string().email(),
      customer_name: z.string(),
      customer_email: z.string().email(),
      customer_id: z.string(),
      ship_to_default: z.string(),
      currency: z.string(),
    })
    .optional(),
});

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    const defaultProfile = buildDefaultChatProfile();
    const profile = body.profile ?? defaultProfile;

    const result = await runOrderCaptureChatTurn({
      message: body.message,
      history: body.history,
      draft: {
        customer_name: body.draft.customer_name ?? profile.customer_name,
        customer_email: body.draft.customer_email ?? profile.customer_email,
        ship_to: body.draft.ship_to ?? profile.ship_to_default,
        currency: body.draft.currency ?? profile.currency,
        ...body.draft,
      },
      profile,
    });

    return NextResponse.json({
      ...result,
      profile,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown chat error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

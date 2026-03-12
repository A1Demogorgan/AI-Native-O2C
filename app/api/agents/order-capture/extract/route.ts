import { NextResponse } from "next/server";
import { z } from "zod";
import { extractOrderDraftFromEmailWithRaw } from "@/lib/agents/orderCaptureAgent";

const schema = z.object({
  mailbox_id: z.string(),
  message_id: z.string(),
  from: z.string(),
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  attachment_file_name: z.string(),
  attachment_text: z.string(),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    const startedAt = Date.now();
    const result = await extractOrderDraftFromEmailWithRaw(body);
    return NextResponse.json({
      ...result,
      processing_seconds: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Order extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

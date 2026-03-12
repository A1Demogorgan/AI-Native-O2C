import { NextResponse } from "next/server";
import { z } from "zod";
import { extractOrderDraftFromEmail } from "@/lib/agents/orderCaptureAgent";

const schema = z.object({
  mailbox_id: z.string().default("manual-mailbox"),
  message_id: z.string().default("manual-message"),
  from: z.string().default("unknown@example.com"),
  to: z.string().default("orders@example.com"),
  email_subject: z.string().min(1),
  email_body: z.string().default(""),
  attachment_text: z.string().min(1),
  attachment_file_name: z.string().default("attachment.pdf"),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  const draft = await extractOrderDraftFromEmail({
    mailbox_id: body.mailbox_id,
    message_id: body.message_id,
    from: body.from,
    to: body.to,
    subject: body.email_subject,
    body: body.email_body,
    attachment_file_name: body.attachment_file_name,
    attachment_text: body.attachment_text,
  });
  return NextResponse.json({ draft });
}

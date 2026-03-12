import { NextResponse } from "next/server";
import { z } from "zod";
import { getLatestMailboxMessage } from "@/lib/order-capture-fixtures/service";

const schema = z.object({ mailbox_id: z.string() });

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  const message = getLatestMailboxMessage(body.mailbox_id);
  if (!message) {
    return NextResponse.json({ error: "No messages for selected mailbox" }, { status: 404 });
  }
  return NextResponse.json(message);
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { updateCollectionActionStatus } from "@/lib/db/dao";

const schema = z.object({
  action_id: z.string(),
  status: z.enum(["contacted", "resolved"]),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const data = schema.parse(await req.json());
  await updateCollectionActionStatus(data.action_id, data.status);
  return NextResponse.json({ ok: true });
}

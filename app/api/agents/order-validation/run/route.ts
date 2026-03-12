import { NextResponse } from "next/server";
import { z } from "zod";
import { listCapturedOrders } from "@/lib/db/dao";
import { runOrderValidationAgent } from "@/lib/agents/orderValidationAgent";

export const runtime = "nodejs";

const schema = z.object({
  limit: z.number().int().min(1).max(200).default(80),
});

export async function POST(req: Request) {
  const body = schema.parse(await req.json().catch(() => ({})));
  const orders = await listCapturedOrders(body.limit);
  const results = await runOrderValidationAgent(orders);
  return NextResponse.json({
    run_at: new Date().toISOString(),
    results,
  });
}

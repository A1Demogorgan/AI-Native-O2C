import { NextResponse } from "next/server";
import { z } from "zod";
import { getCapturedOrder, listCapturedOrders } from "@/lib/db/dao";
import { runCreditRiskForSingle } from "@/lib/agents/creditRiskAgent";

export const runtime = "nodejs";

const schema = z.object({
  capture_id: z.string().min(1),
});

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  const target = await getCapturedOrder(body.capture_id);
  if (!target) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const contextOrders = await listCapturedOrders(300);
  const assessment = await runCreditRiskForSingle(target, contextOrders);
  return NextResponse.json({ assessment });
}

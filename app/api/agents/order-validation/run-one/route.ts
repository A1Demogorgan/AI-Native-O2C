import { NextResponse } from "next/server";
import { z } from "zod";
import { getCapturedOrder, listCapturedOrders } from "@/lib/db/dao";
import { getHistoricalAverageLeadDays, runOrderValidationAgentForSingle } from "@/lib/agents/orderValidationAgent";

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
  const historicalAvg = getHistoricalAverageLeadDays(contextOrders);
  const result = await runOrderValidationAgentForSingle(target, historicalAvg);
  return NextResponse.json({ result, historical_avg_lead_days: historicalAvg });
}

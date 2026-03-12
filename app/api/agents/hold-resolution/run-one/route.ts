import { NextResponse } from "next/server";
import { z } from "zod";
import { runHoldResolutionAgent } from "@/lib/agents/holdResolutionAgent";
import { listHeldOrders } from "@/lib/db/dao";

export const runtime = "nodejs";

const schema = z.object({
  capture_id: z.string().min(1),
});

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  const heldOrders = await listHeldOrders(200);
  const order = heldOrders.find((item) => item.capture_id === body.capture_id);

  if (!order) {
    return NextResponse.json({ error: "Held order not found" }, { status: 404 });
  }

  const proposal = await runHoldResolutionAgent(order);
  return NextResponse.json({ proposal });
}

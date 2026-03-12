import { NextResponse } from "next/server";
import { z } from "zod";
import { runInventoryAllocationAgent } from "@/lib/agents/inventoryAllocationAgent";
import { listAllocationEligibleOrders, listInventoryPositions } from "@/lib/db/dao";

export const runtime = "nodejs";

const schema = z.object({
  capture_id: z.string().min(1),
});

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  const [orders, inventory] = await Promise.all([listAllocationEligibleOrders(200), listInventoryPositions(300)]);
  const order = orders.find((item) => item.capture_id === body.capture_id);

  if (!order) {
    return NextResponse.json({ error: "Allocation-eligible order not found" }, { status: 404 });
  }

  const proposal = await runInventoryAllocationAgent(order, inventory);
  return NextResponse.json({ proposal });
}

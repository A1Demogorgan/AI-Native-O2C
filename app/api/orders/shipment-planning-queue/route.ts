import { NextResponse } from "next/server";
import { listShipmentPlanningQueueOrders } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listShipmentPlanningQueueOrders(120);
  return NextResponse.json(rows);
}

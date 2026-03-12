import { NextResponse } from "next/server";
import { listBillingQueueOrders } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listBillingQueueOrders(120);
  return NextResponse.json(rows);
}

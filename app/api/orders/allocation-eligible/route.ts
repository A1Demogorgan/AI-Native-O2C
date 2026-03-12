import { NextResponse } from "next/server";
import { listAllocationEligibleOrders } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listAllocationEligibleOrders(120);
  return NextResponse.json(rows);
}

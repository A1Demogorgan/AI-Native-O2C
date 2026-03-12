import { NextResponse } from "next/server";
import { listHeldOrders } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listHeldOrders(120);
  return NextResponse.json(rows);
}

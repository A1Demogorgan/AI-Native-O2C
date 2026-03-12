import { NextResponse } from "next/server";
import { listEdiOrders } from "@/lib/edi/orders";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listEdiOrders();
  return NextResponse.json(rows);
}

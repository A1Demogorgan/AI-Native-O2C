import { NextResponse } from "next/server";
import { listCapturedOrders } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listCapturedOrders(120);
  return NextResponse.json(rows);
}

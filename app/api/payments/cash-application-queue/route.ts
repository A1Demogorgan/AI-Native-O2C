import { NextResponse } from "next/server";
import { listCashApplicationQueuePayments } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listCashApplicationQueuePayments(120);
  return NextResponse.json(rows);
}

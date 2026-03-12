import { NextResponse } from "next/server";
import { listPaymentPredictionQueue } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listPaymentPredictionQueue(120);
  return NextResponse.json(rows);
}

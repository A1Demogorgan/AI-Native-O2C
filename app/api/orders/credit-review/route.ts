import { NextResponse } from "next/server";
import { listCreditReviewQueueOrders } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listCreditReviewQueueOrders(120);
  return NextResponse.json(rows);
}

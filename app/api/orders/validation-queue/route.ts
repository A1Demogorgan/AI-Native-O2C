import { NextResponse } from "next/server";
import { listValidationQueueOrders } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listValidationQueueOrders(120);
  return NextResponse.json(rows);
}

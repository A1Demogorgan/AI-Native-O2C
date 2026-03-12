import { NextResponse } from "next/server";
import { listValidatedOrders } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listValidatedOrders(120);
  return NextResponse.json(rows);
}

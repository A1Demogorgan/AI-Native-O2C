import { NextResponse } from "next/server";
import { listInventoryAllocationActions } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listInventoryAllocationActions(200);
  return NextResponse.json(rows);
}

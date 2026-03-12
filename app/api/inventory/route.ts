import { NextResponse } from "next/server";
import { listInventoryPositions } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listInventoryPositions(200);
  return NextResponse.json(rows);
}

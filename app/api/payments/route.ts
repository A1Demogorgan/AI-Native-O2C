import { NextResponse } from "next/server";
import { listPayments } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listPayments();
  return NextResponse.json(rows);
}

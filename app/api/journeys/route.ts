import { NextResponse } from "next/server";
import { listOrderJourneyTrace } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listOrderJourneyTrace(50);
  return NextResponse.json(rows);
}

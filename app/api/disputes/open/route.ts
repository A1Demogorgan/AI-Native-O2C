import { NextResponse } from "next/server";
import { listOpenDisputes } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listOpenDisputes(120);
  return NextResponse.json(rows);
}

import { NextResponse } from "next/server";
import { getKpis } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const kpis = await getKpis();
  return NextResponse.json(kpis);
}

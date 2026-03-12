import { NextRequest, NextResponse } from "next/server";
import { buildConsultantBrief } from "@/lib/consultant/context";

export async function GET(req: NextRequest) {
  const areaId = req.nextUrl.searchParams.get("area_id") ?? "portfolio";
  const areaLabel = req.nextUrl.searchParams.get("area_label") ?? undefined;
  const brief = await buildConsultantBrief(areaId, areaLabel);
  return NextResponse.json(brief);
}

import { NextResponse } from "next/server";
import { listCollectionsActions } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listCollectionsActions();
  return NextResponse.json(rows);
}

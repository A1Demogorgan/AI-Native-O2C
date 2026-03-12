import { NextResponse } from "next/server";
import { listCustomers } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listCustomers();
  return NextResponse.json(rows);
}

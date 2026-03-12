import { NextResponse } from "next/server";
import { listInvoices } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listInvoices();
  return NextResponse.json(rows);
}

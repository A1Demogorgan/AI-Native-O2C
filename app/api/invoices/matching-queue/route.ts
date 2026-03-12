import { NextResponse } from "next/server";
import { listInvoiceMatchingQueue } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listInvoiceMatchingQueue(120);
  return NextResponse.json(rows);
}

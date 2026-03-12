import { NextResponse } from "next/server";
import { listOrderMailboxes } from "@/lib/order-capture-fixtures/service";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(listOrderMailboxes());
}

import { NextResponse } from "next/server";
import { listCashApplicationQueueCustomers } from "@/lib/db/dao";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listCashApplicationQueueCustomers(120);
  return NextResponse.json(
    rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, typeof value === "bigint" ? Number(value) : value]),
      ),
    ),
  );
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { createDispute, listDisputes } from "@/lib/db/dao";

const createSchema = z.object({
  invoice_id: z.string(),
  customer_id: z.string(),
  description: z.string(),
  amount_at_risk: z.number().positive(),
});

export const runtime = "nodejs";

export async function GET() {
  const rows = await listDisputes();
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const data = createSchema.parse(await req.json());
  const dispute = await createDispute(data);
  return NextResponse.json(dispute, { status: 201 });
}

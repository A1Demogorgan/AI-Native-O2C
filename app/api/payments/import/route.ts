import { NextResponse } from "next/server";
import { z } from "zod";
import { createPayment } from "@/lib/db/dao";

const schema = z.object({
  customer_id: z.string(),
  payment_date: z.string(),
  amount_total: z.number().positive(),
  payment_ref: z.string(),
  remittance_text: z.string().default(""),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const data = schema.parse(await req.json());
  const payment = await createPayment(data);
  return NextResponse.json(payment, { status: 201 });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { applyCashApplicationProposal } from "@/lib/agents/cashApplicationAgent";

const schema = z.object({
  customer_id: z.string(),
  allocations: z.array(
    z.object({
      payment_id: z.string(),
      invoice_id: z.string(),
      allocated_amount: z.number().positive(),
      confidence: z.number().min(0).max(1),
      rationale: z.string(),
    }),
  ),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  const grouped = new Map<string, typeof body.allocations>();
  for (const allocation of body.allocations) {
    grouped.set(allocation.payment_id, [...(grouped.get(allocation.payment_id) ?? []), allocation]);
  }

  let appliedCount = 0;
  const results: unknown[] = [];
  for (const [paymentId, paymentAllocations] of grouped.entries()) {
    const result = await applyCashApplicationProposal(paymentId, paymentAllocations);
    appliedCount += result.applied_count;
    results.push(result);
  }

  return NextResponse.json({ customer_id: body.customer_id, applied_count: appliedCount, results });
}

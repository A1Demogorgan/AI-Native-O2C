import { NextResponse } from "next/server";
import { z } from "zod";
import { runPaymentPredictionAgent } from "@/lib/agents/paymentPredictionAgent";
import { getCustomer, listOpenInvoicesByCustomer } from "@/lib/db/dao";
import type { ReviewAgentResult } from "@/lib/types";

export const runtime = "nodejs";

const schema = z.object({ customer_id: z.string().min(1) });

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  const customer = await getCustomer(body.customer_id);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const openInvoices = await listOpenInvoicesByCustomer(customer.customer_id, 100);
  const proposal = runPaymentPredictionAgent({
    customer_id: customer.customer_id,
    risk_score: Number(customer.risk_score),
    payment_terms_days: Number(customer.payment_terms_days),
    open_invoices: openInvoices,
  });

  const totalOpen = openInvoices.reduce((sum, invoice) => sum + Number(invoice.amount_open), 0);
  const review: ReviewAgentResult = {
    subject_id: customer.customer_id,
    action_title: "Predicted payment behavior review",
    action_summary: `Predicted payment date ${proposal.predicted_payment_date} with ${proposal.late_risk} late-risk.`,
    recommended_decision: proposal.late_risk,
    facts: [
      { label: "Customer", value: customer.name },
      { label: "Open invoices", value: String(openInvoices.length) },
      { label: "Open AR", value: `$${totalOpen.toFixed(2)}` },
      { label: "Payment terms", value: `${customer.payment_terms_days} days` },
      { label: "Confidence", value: `${(proposal.confidence * 100).toFixed(1)}%` },
    ],
    insights: proposal.rationale,
    payload: proposal as unknown as Record<string, unknown>,
  };

  return NextResponse.json({ review });
}

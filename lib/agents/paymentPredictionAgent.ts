import type { Invoice, PaymentPredictionProposal } from "@/lib/types";

export function runPaymentPredictionAgent(input: {
  customer_id: string;
  risk_score: number;
  payment_terms_days: number;
  open_invoices: Invoice[];
}): PaymentPredictionProposal {
  const maxDueDate = input.open_invoices
    .map((invoice) => invoice.due_date)
    .sort()
    .at(-1) ?? new Date().toISOString().slice(0, 10);

  const predicted = new Date(maxDueDate);
  const lateOffset = input.risk_score >= 0.75 ? 12 : input.risk_score >= 0.45 ? 5 : 0;
  predicted.setDate(predicted.getDate() + lateOffset);

  const lateRisk = input.risk_score >= 0.75 ? "high" : input.risk_score >= 0.45 ? "medium" : "low";
  return {
    customer_id: input.customer_id,
    predicted_payment_date: predicted.toISOString().slice(0, 10),
    late_risk: lateRisk,
    confidence: Number((0.64 + Math.min(0.3, input.open_invoices.length * 0.03)).toFixed(2)),
    rationale: [
      `Predicted from invoice due dates with payment terms ${input.payment_terms_days} days.`,
      `Customer risk score ${input.risk_score.toFixed(2)} maps to ${lateRisk} late-pay risk.`,
      `Open invoice count ${input.open_invoices.length} informs confidence.`,
    ],
  };
}

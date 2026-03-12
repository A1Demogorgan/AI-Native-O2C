import type { Invoice, InvoiceMatchingProposal } from "@/lib/types";

export function runInvoiceMatchingAgent(input: {
  invoice: Invoice;
  dispute_count: number;
  contract_variance: number;
  po_variance: number;
}): InvoiceMatchingProposal {
  const contractVariance = Number(input.contract_variance.toFixed(2));
  const poVariance = Number(input.po_variance.toFixed(2));
  const varianceAmount = Number(Math.max(Math.abs(contractVariance), Math.abs(poVariance)).toFixed(2));
  const reasons: string[] = [];
  let matchStatus: InvoiceMatchingProposal["match_status"] = "matched";

  if (input.dispute_count > 0) {
    reasons.push(`Invoice has ${input.dispute_count} linked dispute(s).`);
    matchStatus = "investigate";
  }

  if (varianceAmount > 0.01) {
    if (Math.abs(contractVariance) > 0.01) {
      reasons.push(`Contract-to-invoice variance: ${contractVariance >= 0 ? "+" : ""}${contractVariance.toFixed(2)}.`);
    }
    if (Math.abs(poVariance) > 0.01) {
      reasons.push(`PO-to-invoice variance: ${poVariance >= 0 ? "+" : ""}${poVariance.toFixed(2)}.`);
    }
    matchStatus = input.dispute_count > 0 ? "investigate" : "variance_detected";
  }

  return {
    invoice_id: input.invoice.invoice_id,
    match_status: matchStatus,
    variance_amount: varianceAmount,
    reasons,
    summary:
      matchStatus === "matched"
        ? `Invoice ${input.invoice.invoice_id} is matched with no material variance.`
        : `Invoice ${input.invoice.invoice_id} requires review due to a 3-way match variance or dispute exposure.`,
  };
}

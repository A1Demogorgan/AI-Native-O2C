import { getDispute, getInvoice, updateDispute } from "@/lib/db/dao";

export async function getDisputeTool(disputeId: string) {
  return getDispute(disputeId);
}

export async function getInvoiceTool(invoiceId: string) {
  return getInvoice(invoiceId);
}

export async function updateDisputeTool(
  disputeId: string,
  input: { dispute_type: string; evidence_summary: string; status?: string },
) {
  return updateDispute(disputeId, input);
}

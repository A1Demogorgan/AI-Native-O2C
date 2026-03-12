import { createAllocations, getPayment, listOpenInvoicesByCustomer } from "@/lib/db/dao";

export async function getPaymentTool(paymentId: string) {
  return getPayment(paymentId);
}

export async function listOpenInvoicesTool(customerId: string) {
  return listOpenInvoicesByCustomer(customerId);
}

export async function createAllocationsTool(input: {
  payment_id: string;
  allocations: Array<{ invoice_id: string; allocated_amount: number; confidence: number; rationale: string }>;
  created_by: string;
}) {
  return createAllocations(input);
}

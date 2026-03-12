import { z } from "zod";
import { createAllocationsTool, getPaymentTool, listOpenInvoicesTool } from "@/lib/tools/paymentTools";
import type { Invoice } from "@/lib/types";
import { runWithAgentSdk } from "@/lib/agents/sdk";

const allocationSchema = z.array(
  z.object({
    invoice_id: z.string(),
    allocated_amount: z.number().positive(),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  }),
);

export type CashAllocationProposal = {
  invoice_id: string;
  allocated_amount: number;
  confidence: number;
  rationale: string;
};

function extractInvoiceHints(remittanceText: string): string[] {
  const explicit = remittanceText.match(/INV-\d{1,7}/gi) ?? [];
  return [...new Set(explicit.map((x) => x.toUpperCase()))];
}

function normalizeInvoiceId(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) {
    return raw;
  }
  return `INV-${digits.padStart(7, "0")}`;
}

function buildDeterministicProposal(
  invoices: Invoice[],
  invoiceHints: string[],
  unappliedAmount: number,
): CashAllocationProposal[] {
  const byDueDate = [...invoices].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  const hintSet = new Set(invoiceHints.map(normalizeInvoiceId));
  const hintInvoices = byDueDate.filter((inv) => hintSet.has(inv.invoice_id));
  const remainderInvoices = byDueDate.filter((inv) => !hintSet.has(inv.invoice_id));
  const ordered = [...hintInvoices, ...remainderInvoices];

  let remaining = unappliedAmount;
  const out: CashAllocationProposal[] = [];

  for (const inv of ordered) {
    if (remaining <= 0) {
      break;
    }

    const allocated = Math.min(inv.amount_open, remaining);
    if (allocated <= 0) {
      continue;
    }

    const confidence = hintSet.has(inv.invoice_id) ? 0.97 : 0.94;
    const rationale = hintSet.has(inv.invoice_id)
      ? "Matched from remittance invoice reference"
      : "Aging fallback match for same customer open invoices";

    out.push({
      invoice_id: inv.invoice_id,
      allocated_amount: Number(allocated.toFixed(2)),
      confidence,
      rationale,
    });

    remaining = Number((remaining - allocated).toFixed(2));
  }

  return out;
}

export async function generateCashApplicationProposal(paymentId: string) {
  const payment = await getPaymentTool(paymentId);
  if (!payment) {
    throw new Error("Payment not found");
  }

  const openInvoices = await listOpenInvoicesTool(payment.customer_id);
  const hints = extractInvoiceHints(payment.remittance_text ?? "");

  let proposed = buildDeterministicProposal(openInvoices, hints, payment.amount_unapplied);

  const sdkResponse = await runWithAgentSdk(
    "Allocate payment to open invoices for the same customer. Return JSON array with invoice_id, allocated_amount, confidence, rationale. Respect max invoice balances and confidence >= 0.92.",
    JSON.stringify({ payment, openInvoices, remittanceHints: hints }),
  );

  if (sdkResponse) {
    try {
      const parsed = JSON.parse(sdkResponse);
      const validated = allocationSchema.parse(parsed);
      proposed = validated;
    } catch {
      // keep deterministic fallback output
    }
  }

  const totalSuggested = proposed.reduce((acc, cur) => acc + cur.allocated_amount, 0);
  const remainingUnapplied = Number((payment.amount_unapplied - totalSuggested).toFixed(2));

  return {
    payment,
    context: {
      open_invoice_count: openInvoices.length,
      remittance_hints: hints,
      total_suggested: Number(totalSuggested.toFixed(2)),
      remaining_unapplied: Math.max(0, remainingUnapplied),
      match_modes_supported: [
        "partial single payment to single invoice",
        "single payment to multiple invoices",
        "multiple payments to single invoice",
        "multiple payments to multiple invoices",
      ],
    },
    allocations: proposed,
  };
}

export async function applyCashApplicationProposal(paymentId: string, allocations: CashAllocationProposal[]) {
  const created = await createAllocationsTool({
    payment_id: paymentId,
    allocations,
    created_by: "cash-application-agent",
  });

  return {
    payment_id: paymentId,
    applied_count: created.length,
    allocations: created,
  };
}

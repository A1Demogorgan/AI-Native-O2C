import { NextResponse } from "next/server";
import { z } from "zod";
import { listOpenInvoicesByCustomer, listUnappliedPaymentsByCustomer } from "@/lib/db/dao";
import type { Invoice, Payment, ReviewAgentResult } from "@/lib/types";

const schema = z.object({ customer_id: z.string().min(1) });

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  const [payments, invoices] = await Promise.all([
    listUnappliedPaymentsByCustomer(body.customer_id, 100),
    listOpenInvoicesByCustomer(body.customer_id, 100),
  ]);
  if (payments.length === 0 || invoices.length === 0) {
    return NextResponse.json({ error: "No cash application candidates found for customer" }, { status: 404 });
  }

  const invoiceBalances = new Map(invoices.map((invoice) => [invoice.invoice_id, Number(invoice.amount_open)]));
  const allocations: Array<{ payment_id: string; invoice_id: string; allocated_amount: number; confidence: number; rationale: string }> = [];

  for (const payment of payments) {
    let remaining = Number(payment.amount_unapplied);
    const hintedInvoices = extractInvoiceHints(payment.remittance_text)
      .map(normalizeInvoiceId)
      .filter((invoiceId) => invoiceBalances.has(invoiceId));
    const orderedInvoices = [
      ...hintedInvoices.map((invoiceId) => invoices.find((invoice) => invoice.invoice_id === invoiceId)).filter(Boolean),
      ...invoices
        .filter((invoice) => !hintedInvoices.includes(invoice.invoice_id))
        .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()),
    ] as Invoice[];

    for (const invoice of orderedInvoices) {
      const open = Number(invoiceBalances.get(invoice.invoice_id) ?? 0);
      if (remaining <= 0 || open <= 0) {
        continue;
      }
      const applied = Math.min(open, remaining);
      allocations.push({
        payment_id: payment.payment_id,
        invoice_id: invoice.invoice_id,
        allocated_amount: Number(applied.toFixed(2)),
        confidence: hintedInvoices.includes(invoice.invoice_id) ? 0.97 : 0.94,
        rationale: hintedInvoices.includes(invoice.invoice_id)
          ? "Matched from remittance reference."
          : "Applied to oldest open invoice for the same customer.",
      });
      invoiceBalances.set(invoice.invoice_id, Number((open - applied).toFixed(2)));
      remaining = Number((remaining - applied).toFixed(2));
    }
  }

  const paymentCount = new Set(allocations.map((item) => item.payment_id)).size;
  const invoiceCount = new Set(allocations.map((item) => item.invoice_id)).size;
  const pattern =
    paymentCount <= 1
      ? invoiceCount <= 1
        ? "single payment -> single invoice"
        : "single payment -> multiple invoices"
      : invoiceCount <= 1
        ? "multiple payments -> single invoice"
        : "multiple payments -> multiple invoices";

  const totalApplied = allocations.reduce((sum, item) => sum + item.allocated_amount, 0);
  const totalUnappliedCash = payments.reduce((sum, payment) => sum + Number(payment.amount_unapplied), 0);
  const review: ReviewAgentResult = {
    subject_id: body.customer_id,
    action_title: "Cash application proposal",
    action_summary: `Apply ${paymentCount} payment(s) across ${invoiceCount} invoice(s) using the ${pattern} pattern.`,
    recommended_decision: pattern,
    facts: [
      { label: "Customer", value: body.customer_id },
      { label: "Unapplied payments", value: String(payments.length) },
      { label: "Open invoices", value: String(invoices.length) },
      { label: "Total proposed application", value: `$${totalApplied.toFixed(2)}` },
      { label: "Match pattern", value: pattern },
    ],
    insights: allocations.slice(0, 8).map(
      (item) =>
        `${item.payment_id} -> ${item.invoice_id} for $${item.allocated_amount.toFixed(2)} (${item.rationale})`,
    ),
    payload: {
      customer_id: body.customer_id,
      pattern,
      total_unapplied_cash: Number(totalUnappliedCash.toFixed(2)),
      allocations,
      payments: payments as unknown as Payment[],
      invoices: invoices as unknown as Invoice[],
    },
  };

  return NextResponse.json({ review });
}

function extractInvoiceHints(remittanceText: string): string[] {
  const explicit = remittanceText.match(/INV-[A-Z0-9-]+/gi) ?? [];
  return [...new Set(explicit.map((x) => x.toUpperCase()))];
}

function normalizeInvoiceId(raw: string) {
  return raw.trim().toUpperCase();
}

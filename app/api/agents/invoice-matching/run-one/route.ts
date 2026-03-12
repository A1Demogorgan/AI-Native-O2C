import { NextResponse } from "next/server";
import { z } from "zod";
import { runInvoiceMatchingAgent } from "@/lib/agents/invoiceMatchingAgent";
import { getCapturedOrder, getContractSnapshotByCapture, getInvoice, listDisputesByInvoice } from "@/lib/db/dao";
import type { ReviewAgentResult } from "@/lib/types";

export const runtime = "nodejs";

const schema = z.object({ invoice_id: z.string().min(1) });

function inferCaptureId(invoiceId: string): string | null {
  const dsnMatch = invoiceId.match(/^INV-(DSN)-(\d{3})(?:-B)?$/);
  if (dsnMatch) {
    return `ORDCAP-${dsnMatch[1]}-${dsnMatch[2]}`;
  }
  return null;
}

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  const invoice = await getInvoice(body.invoice_id);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const disputes = await listDisputesByInvoice(invoice.invoice_id);
  const captureId = invoice.capture_id ?? inferCaptureId(invoice.invoice_id);
  const order = captureId ? await getCapturedOrder(captureId) : null;
  const contract = captureId ? await getContractSnapshotByCapture(captureId) : null;
  const poAmount = Number(order?.total_amount ?? invoice.amount_total);
  const contractAmount = Number(contract?.total_amount ?? invoice.amount_total);
  const invoiceAmount = Number(invoice.amount_total);
  const contractVariance = Number((invoiceAmount - contractAmount).toFixed(2));
  const poVariance = Number((invoiceAmount - poAmount).toFixed(2));
  const proposal = runInvoiceMatchingAgent({
    invoice,
    dispute_count: disputes.length,
    contract_variance: contractVariance,
    po_variance: poVariance,
  });
  const varianceLabel =
    Math.abs(contractVariance) > 0.01 || Math.abs(poVariance) > 0.01
      ? `Variance detected: contract ${contractVariance >= 0 ? "+" : ""}$${contractVariance.toFixed(2)}, PO ${poVariance >= 0 ? "+" : ""}$${poVariance.toFixed(2)}.`
      : "No material contract or PO variance detected.";
  const review: ReviewAgentResult = {
    subject_id: invoice.invoice_id,
    action_title: proposal.match_status === "matched" ? "3-way match cleared" : "3-way match requires review",
    action_summary: `${proposal.summary} ${varianceLabel}`,
    recommended_decision: proposal.match_status,
    facts: [
      { label: "Capture / PO", value: captureId ?? "Not linked" },
      { label: "Contract ID", value: contract?.contract_id ?? "Not linked" },
      { label: "Contract amount", value: `$${contractAmount.toFixed(2)}` },
      { label: "PO amount", value: `$${poAmount.toFixed(2)}` },
      { label: "Invoice amount", value: `$${invoiceAmount.toFixed(2)}` },
      { label: "Contract variance", value: `${contractVariance >= 0 ? "+" : ""}$${contractVariance.toFixed(2)}` },
      { label: "PO variance", value: `${poVariance >= 0 ? "+" : ""}$${poVariance.toFixed(2)}` },
      { label: "3-way match status", value: proposal.match_status.replaceAll("_", " ") },
    ],
    insights: [
      ...proposal.reasons,
      contract?.source_summary ?? "No persisted contract snapshot found.",
      disputes.length > 0 ? `${disputes.length} active dispute(s) linked to this invoice.` : "No active disputes linked.",
    ],
    payload: {
      ...proposal,
      contract_id: contract?.contract_id ?? null,
      contract_amount: contractAmount,
      po_amount: poAmount,
      invoice_amount: invoiceAmount,
      contract_variance: contractVariance,
      po_variance: poVariance,
      capture_id: captureId,
      contract_terms: contract?.commercial_terms_json ?? null,
    },
  };

  return NextResponse.json({ review });
}

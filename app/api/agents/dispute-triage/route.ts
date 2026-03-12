import { NextResponse } from "next/server";
import { z } from "zod";
import { getDispute, getInvoice } from "@/lib/db/dao";
import type { ReviewAgentResult } from "@/lib/types";

const schema = z.object({ dispute_id: z.string() });

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  const dispute = await getDispute(body.dispute_id);
  if (!dispute) {
    return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
  }
  const invoice = await getInvoice(dispute.invoice_id);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const lower = dispute.description.toLowerCase();
  const seededType = String(dispute.dispute_type ?? "").toLowerCase();
  const disputeType =
    seededType === "pricing" || seededType === "quality" || seededType === "delivery" || seededType === "short_ship"
      ? seededType
      : lower.includes("price") || lower.includes("rate")
        ? "pricing"
        : lower.includes("damage") || lower.includes("quality")
          ? "quality"
          : lower.includes("missing") || lower.includes("ship") || lower.includes("delivery")
            ? "delivery"
            : "other";

  const evidenceSummary =
    dispute.evidence_summary ||
    `Invoice ${invoice.invoice_id} has ${disputeType} dispute exposure for $${Number(dispute.amount_at_risk).toFixed(2)}. Description: ${dispute.description}`;

  const review: ReviewAgentResult = {
    subject_id: dispute.dispute_id,
    action_title: `Triaged dispute as ${disputeType}`,
    action_summary: `Review facts and confirm the next action for dispute ${dispute.dispute_id}.`,
    recommended_decision: disputeType,
    facts: [
      { label: "Capture", value: dispute.capture_id ?? "Not linked" },
      { label: "Invoice", value: dispute.invoice_id },
      { label: "Customer", value: dispute.customer_id },
      { label: "Amount at risk", value: `$${Number(dispute.amount_at_risk).toFixed(2)}` },
      { label: "Current status", value: dispute.status },
      { label: "Description", value: dispute.description },
    ],
    insights: [evidenceSummary],
    payload: {
      dispute_id: dispute.dispute_id,
      dispute_type: disputeType,
      evidence_summary: evidenceSummary,
      status: "in_review",
    },
  };

  return NextResponse.json({ review });
}

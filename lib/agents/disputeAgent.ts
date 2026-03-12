import { getDisputeTool, getInvoiceTool, updateDisputeTool } from "@/lib/tools/disputeTools";
import { runWithAgentSdk } from "@/lib/agents/sdk";

function classify(description: string) {
  const lower = description.toLowerCase();
  if (lower.includes("price") || lower.includes("rate")) return "pricing";
  if (lower.includes("damage") || lower.includes("quality")) return "quality";
  if (lower.includes("missing") || lower.includes("not received")) return "delivery";
  return "other";
}

export async function runDisputeTriageAgent(disputeId: string) {
  const dispute = await getDisputeTool(disputeId);
  if (!dispute) {
    throw new Error("Dispute not found");
  }

  const invoice = await getInvoiceTool(dispute.invoice_id);
  if (!invoice) {
    throw new Error("Invoice not found");
  }

  let disputeType = classify(dispute.description);
  let summary = `Invoice ${invoice.invoice_id} for customer ${invoice.customer_id} has ${disputeType} dispute risk on ${dispute.amount_at_risk}.`;

  const sdkResponse = await runWithAgentSdk(
    "Classify dispute and return compact JSON with keys dispute_type and evidence_summary.",
    JSON.stringify({ dispute, invoice }),
  );

  if (sdkResponse) {
    try {
      const parsed = JSON.parse(sdkResponse) as { dispute_type?: string; evidence_summary?: string };
      disputeType = parsed.dispute_type || disputeType;
      summary = parsed.evidence_summary || summary;
    } catch {
      // use fallback
    }
  }

  const updated = await updateDisputeTool(disputeId, {
    dispute_type: disputeType,
    evidence_summary: summary,
    status: "in_review",
  });

  return { dispute: updated };
}

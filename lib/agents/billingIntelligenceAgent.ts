import type { BillingIntelligenceProposal } from "@/lib/types";

export function runBillingIntelligenceAgent(input: {
  capture_id: string;
  total_amount: number;
  planned_ship_date: string | null;
  plan_status?: string;
}): BillingIntelligenceProposal {
  const anomalies: string[] = [];
  let billingStatus: BillingIntelligenceProposal["billing_status"] = "ready_to_invoice";

  if (!input.planned_ship_date) {
    billingStatus = "missing_prerequisite";
    anomalies.push("No shipment date recorded for invoice creation.");
  }

  if (input.plan_status === "manual_review" || input.plan_status === "capacity_risk") {
    billingStatus = "hold_for_review";
    anomalies.push("Shipment plan contains operational risk that should block auto-billing.");
  }

  return {
    capture_id: input.capture_id,
    billing_status: billingStatus,
    invoice_amount: Number(input.total_amount.toFixed(2)),
    billing_date: billingStatus === "ready_to_invoice" ? input.planned_ship_date : null,
    anomalies,
    summary:
      billingStatus === "ready_to_invoice"
        ? `Order ${input.capture_id} is ready for invoice creation on ${input.planned_ship_date}.`
        : `Order ${input.capture_id} requires billing review before invoice release.`,
  };
}

import type { ProcessMiningInsight } from "@/lib/types";

export function runProcessMiningAgent(input: {
  held_orders: number;
  open_disputes: number;
  open_collections: number;
  unapplied_payments: number;
}): ProcessMiningInsight[] {
  return [
    {
      bottleneck_stage: "Credit / Hold Resolution",
      severity: input.held_orders > 5 ? "high" : input.held_orders > 1 ? "medium" : "low",
      summary: `${input.held_orders} orders are currently blocked in the hold stage.`,
      impacted_records: input.held_orders,
      recommendation: "Tighten hold cure SLAs and auto-route common credit-limit holds.",
    },
    {
      bottleneck_stage: "Dispute Triage",
      severity: input.open_disputes > 100 ? "high" : "medium",
      summary: `${input.open_disputes} disputes are contributing to order and cash delays.`,
      impacted_records: input.open_disputes,
      recommendation: "Auto-classify dispute types and prebuild evidence packs for frequent patterns.",
    },
    {
      bottleneck_stage: "Cash Application",
      severity: input.unapplied_payments > 5000 ? "medium" : "low",
      summary: `Unapplied cash of ${input.unapplied_payments.toFixed(2)} remains in the process.`,
      impacted_records: Math.round(input.unapplied_payments / 1000),
      recommendation: "Increase auto-match coverage on common remittance formats and short-pay scenarios.",
    },
  ];
}

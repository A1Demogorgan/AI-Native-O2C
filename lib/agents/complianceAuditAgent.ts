import type { ComplianceAuditFinding } from "@/lib/types";

export function runComplianceAuditAgent(input: {
  credit_overrides: number;
  holds_without_resolution: number;
  inventory_exceptions: number;
}): ComplianceAuditFinding[] {
  return [
    {
      control_area: "Credit Overrides",
      severity: input.credit_overrides > 3 ? "high" : input.credit_overrides > 0 ? "medium" : "low",
      summary: `${input.credit_overrides} credit overrides were recorded.`,
      impacted_records: input.credit_overrides,
      recommendation: "Review override rationale quality and approval thresholds.",
    },
    {
      control_area: "Hold Governance",
      severity: input.holds_without_resolution > 2 ? "high" : "medium",
      summary: `${input.holds_without_resolution} held orders have no recorded resolution action.`,
      impacted_records: input.holds_without_resolution,
      recommendation: "Require hold-resolution logging before orders can be manually progressed.",
    },
    {
      control_area: "Inventory Exceptions",
      severity: input.inventory_exceptions > 2 ? "medium" : "low",
      summary: `${input.inventory_exceptions} inventory allocation exceptions were escalated.`,
      impacted_records: input.inventory_exceptions,
      recommendation: "Audit stock accuracy and substitute approval policy for exception lines.",
    },
  ];
}

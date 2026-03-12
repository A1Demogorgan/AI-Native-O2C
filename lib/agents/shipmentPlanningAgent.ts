import type { InventoryAllocationLineResult, ShipmentPlanningProposal } from "@/lib/types";

function parseLines(raw: string): InventoryAllocationLineResult[] {
  try {
    const parsed = JSON.parse(raw) as InventoryAllocationLineResult[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function runShipmentPlanningAgent(input: {
  capture_id: string;
  requested_date: string;
  allocation_summary?: string;
  allocation_lines_json?: string;
}): ShipmentPlanningProposal {
  const lines = parseLines(input.allocation_lines_json ?? "[]");
  const shipFrom = Array.from(new Set(lines.map((line) => line.source_location).filter((value): value is string => Boolean(value))));
  const hasSplit = lines.some((line) => line.status === "partial" || line.status === "backordered");
  const hasEscalation = lines.some((line) => line.status === "escalated");

  const planStatus = hasEscalation ? "manual_review" : hasSplit ? "split_required" : shipFrom.length > 1 ? "capacity_risk" : "scheduled";
  const plannedShipDate =
    lines.map((line) => line.proposed_ship_date).filter((value): value is string => Boolean(value)).sort()[0] ?? input.requested_date;
  const deliveryDate = plannedShipDate ? (() => {
    const next = new Date(plannedShipDate);
    next.setDate(next.getDate() + 4);
    return next.toISOString().slice(0, 10);
  })() : null;

  return {
    capture_id: input.capture_id,
    plan_status: planStatus,
    ship_from: shipFrom,
    planned_ship_date: plannedShipDate,
    estimated_delivery_date: deliveryDate,
    carrier_strategy: hasSplit ? "Use staged LTL releases with milestone notifications." : "Use standard contracted carrier lane.",
    milestones: hasSplit
      ? ["Release available stock", "Confirm inbound arrival", "Trigger second shipment"]
      : ["Reserve dock slot", "Book carrier", "Issue ASN"],
    summary:
      input.allocation_summary ??
      `Shipment plan for ${input.capture_id} is ${planStatus.replaceAll("_", " ")} with ship date ${plannedShipDate ?? "TBD"}.`,
  };
}

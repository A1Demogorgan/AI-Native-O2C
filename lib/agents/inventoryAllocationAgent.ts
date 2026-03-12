import { z } from "zod";
import { runWithAgentSdkStrict } from "@/lib/agents/sdk";
import type {
  AllocationEligibleOrder,
  InventoryAllocationDecision,
  InventoryAllocationLineResult,
  InventoryAllocationProposal,
  InventoryPosition,
  OrderLineItem,
} from "@/lib/types";

const narrativeSchema = z.object({
  summary: z.string(),
  recommended_actions: z.array(z.string()).default([]),
  escalation_reason: z.string().nullable(),
});

const substituteMap: Record<string, string> = {
  "HTL-KING-HYBRID": "HTL-KING-PLUSH",
  "HTL-QUEEN-PREMIUM": "HTL-QUEEN-FIRM",
  "HTL-CAL-KING-PREMIUM": "HTL-KING-HYBRID",
};

function parseAgentJson(raw: string) {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fence ? fence[1].trim() : trimmed);
}

function parseLineItems(raw: string): OrderLineItem[] {
  try {
    const parsed = JSON.parse(raw) as OrderLineItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function bestInventoryPosition(sku: string, positions: InventoryPosition[]) {
  return positions
    .filter((position) => position.sku === sku)
    .sort((a, b) => Number(b.available_qty) - Number(a.available_qty))[0] ?? null;
}

function proposedShipDate(orderDate: string, daysOffset: number) {
  const date = new Date(orderDate);
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().slice(0, 10);
}

function lineDecisionFor(item: OrderLineItem, order: AllocationEligibleOrder, inventory: InventoryPosition[]): InventoryAllocationLineResult {
  const direct = bestInventoryPosition(item.sku, inventory);
  const directAvailable = Number(direct?.available_qty ?? 0);
  const directInbound = Number(direct?.inbound_qty ?? 0);
  const directInboundDate = direct?.next_inbound_date ?? null;

  if (directAvailable >= item.quantity) {
    return {
      sku: item.sku,
      ordered_qty: item.quantity,
      allocated_qty: item.quantity,
      backordered_qty: 0,
      status: "allocated",
      source_location: direct?.location ?? null,
      substitute_sku: null,
      proposed_ship_date: order.requested_date,
      rationale: `Available stock at ${direct?.location ?? "primary node"} covers the requested quantity.`,
    };
  }

  const substituteSku = substituteMap[item.sku];
  const substitute = substituteSku ? bestInventoryPosition(substituteSku, inventory) : null;
  const substituteAvailable = Number(substitute?.available_qty ?? 0);

  if (substituteSku && substitute && substituteAvailable >= item.quantity) {
    return {
      sku: item.sku,
      ordered_qty: item.quantity,
      allocated_qty: item.quantity,
      backordered_qty: 0,
      status: "substituted",
      source_location: substitute.location,
      substitute_sku: substituteSku,
      proposed_ship_date: proposedShipDate(order.requested_date, 1),
      rationale: `Primary SKU is short. Substitute ${substituteSku} is available in ${substitute.location}.`,
    };
  }

  if (directAvailable > 0) {
    return {
      sku: item.sku,
      ordered_qty: item.quantity,
      allocated_qty: directAvailable,
      backordered_qty: Math.max(0, item.quantity - directAvailable),
      status: "partial",
      source_location: direct?.location ?? null,
      substitute_sku: null,
      proposed_ship_date: directInboundDate ?? proposedShipDate(order.requested_date, 5),
      rationale: `Only ${directAvailable} units are currently available. Remaining quantity should wait for inbound stock.`,
    };
  }

  if (directInbound > 0 || directInboundDate) {
    return {
      sku: item.sku,
      ordered_qty: item.quantity,
      allocated_qty: 0,
      backordered_qty: item.quantity,
      status: "backordered",
      source_location: direct?.location ?? null,
      substitute_sku: null,
      proposed_ship_date: directInboundDate ?? proposedShipDate(order.requested_date, 7),
      rationale: "No available stock now. Inbound inventory can satisfy this line on the next replenishment date.",
    };
  }

  return {
    sku: item.sku,
    ordered_qty: item.quantity,
    allocated_qty: 0,
    backordered_qty: item.quantity,
    status: "escalated",
    source_location: null,
    substitute_sku: substituteSku ?? null,
    proposed_ship_date: null,
    rationale: "No stock, no qualifying substitute, and no near-term inbound supply found.",
  };
}

function summarizeDecision(lines: InventoryAllocationLineResult[]): InventoryAllocationDecision {
  const hasEscalation = lines.some((line) => line.status === "escalated");
  const hasBackorder = lines.some((line) => line.status === "backordered");
  const hasPartial = lines.some((line) => line.status === "partial");
  const hasSubstitute = lines.some((line) => line.status === "substituted");

  if (hasEscalation) return "escalate";
  if (hasSubstitute && lines.every((line) => line.backordered_qty === 0)) return "substitute";
  if (hasPartial) return "split_shipment";
  if (hasBackorder && lines.every((line) => line.allocated_qty === 0)) return "backorder";
  if (hasBackorder) return "allocate_partial";
  return "allocate_full";
}

function baselineProposal(order: AllocationEligibleOrder, inventory: InventoryPosition[]): InventoryAllocationProposal {
  const lines = parseLineItems(order.line_items_json).map((item) => lineDecisionFor(item, order, inventory));
  const totalOrdered = lines.reduce((sum, line) => sum + line.ordered_qty, 0);
  const totalAllocated = lines.reduce((sum, line) => sum + line.allocated_qty, 0);
  const fillRate = totalOrdered === 0 ? 0 : Number((totalAllocated / totalOrdered).toFixed(3));
  const revenueAtRisk = Number((Number(order.total_amount) * (1 - fillRate)).toFixed(2));
  const decision = summarizeDecision(lines);

  const recommendedActions = [
    decision === "allocate_full" ? "Reserve stock and hand off to shipment planning." : "Review exception handling path before committing inventory.",
  ];
  if (decision === "substitute") recommendedActions.push("Confirm substitute acceptance with sales or customer service.");
  if (decision === "split_shipment" || decision === "allocate_partial") recommendedActions.push("Release available quantity now and schedule balance on inbound receipt.");
  if (decision === "backorder") recommendedActions.push("Backorder the affected lines and update requested ship date.");
  if (decision === "escalate") recommendedActions.push("Escalate sourcing exception to supply planning.");

  return {
    capture_id: order.capture_id,
    decision,
    summary: `Order ${order.capture_id} is ${decision.replaceAll("_", " ")} with fill rate ${(fillRate * 100).toFixed(1)}%.`,
    fill_rate: fillRate,
    revenue_at_risk: revenueAtRisk,
    lines,
    recommended_actions: recommendedActions,
    escalation_reason: decision === "escalate" ? "No feasible inventory path was identified for one or more lines." : null,
  };
}

async function refineNarrativeWithAgent(
  base: InventoryAllocationProposal,
  order: AllocationEligibleOrder,
  inventory: InventoryPosition[],
): Promise<InventoryAllocationProposal> {
  const systemPrompt = [
    "You are an Inventory & Allocation Agent for order-to-cash.",
    "The line-level allocation plan and decision are fixed.",
    "Improve only summary, recommended_actions, and escalation_reason.",
    "Return ONLY JSON with keys summary, recommended_actions, escalation_reason.",
  ].join(" ");

  const raw = await runWithAgentSdkStrict(
    systemPrompt,
    JSON.stringify({
      order,
      inventory,
      baseline: base,
    }),
  );

  const parsed = narrativeSchema.parse(parseAgentJson(raw));
  return {
    ...base,
    summary: parsed.summary,
    recommended_actions: parsed.recommended_actions.length > 0 ? parsed.recommended_actions : base.recommended_actions,
    escalation_reason: parsed.escalation_reason,
  };
}

export async function runInventoryAllocationAgent(
  order: AllocationEligibleOrder,
  inventory: InventoryPosition[],
): Promise<InventoryAllocationProposal> {
  const base = baselineProposal(order, inventory);
  try {
    return await refineNarrativeWithAgent(base, order, inventory);
  } catch {
    return base;
  }
}

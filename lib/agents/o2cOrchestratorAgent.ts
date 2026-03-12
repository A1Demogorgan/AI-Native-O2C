import type { OrchestratorRecommendation } from "@/lib/types";

export function runO2COrchestratorAgent(input: {
  held_order_ids: string[];
  disputed_invoice_ids: string[];
  unapplied_payment_ids: string[];
  open_collection_action_ids: string[];
}): OrchestratorRecommendation[] {
  const items: OrchestratorRecommendation[] = [];

  items.push(
    ...input.held_order_ids.slice(0, 5).map((entityId) => ({
      work_item_type: "order" as const,
      entity_id: entityId,
      next_agent: "hold-resolution",
      priority: "high" as const,
      summary: "Held order requires resolution before the workflow can continue.",
    })),
  );

  items.push(
    ...input.disputed_invoice_ids.slice(0, 5).map((entityId) => ({
      work_item_type: "invoice" as const,
      entity_id: entityId,
      next_agent: "dispute-triage-resolution",
      priority: "medium" as const,
      summary: "Invoice has dispute exposure and should be triaged.",
    })),
  );

  items.push(
    ...input.unapplied_payment_ids.slice(0, 5).map((entityId) => ({
      work_item_type: "payment" as const,
      entity_id: entityId,
      next_agent: "cash-application",
      priority: "medium" as const,
      summary: "Payment remains unapplied and should be matched.",
    })),
  );

  items.push(
    ...input.open_collection_action_ids.slice(0, 5).map((entityId) => ({
      work_item_type: "collection" as const,
      entity_id: entityId,
      next_agent: "collections-communications",
      priority: "medium" as const,
      summary: "Collections action is open and ready for outbound communication.",
    })),
  );

  return items;
}

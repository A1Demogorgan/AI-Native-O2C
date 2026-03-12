import { listAgingInvoicesTool, createCollectionActionsTool } from "@/lib/tools/collectionsTools";
import { dbAll } from "@/lib/db/duckdb";
import type { Customer } from "@/lib/types";
import { runWithAgentSdk } from "@/lib/agents/sdk";

export async function runCollectionsStrategyAgent(date: string) {
  const agingInvoices = await listAgingInvoicesTool(250);
  const customers = await dbAll<Customer>("SELECT * FROM customers");
  const customerById = new Map(customers.map((c) => [c.customer_id, c]));

  let items = agingInvoices.slice(0, 80).map((invoice) => {
    const customer = customerById.get(invoice.customer_id);
    const daysLate = Math.max(0, Math.floor((new Date(date).getTime() - new Date(invoice.due_date).getTime()) / 86400000));
    const risk = customer?.risk_score ?? 0.5;
    const priority = Number((risk * 0.6 + Math.min(daysLate / 90, 1) * 0.4).toFixed(3));

    return {
      customer_id: invoice.customer_id,
      invoice_id: invoice.invoice_id,
      action_type: priority > 0.75 ? "call" : "email",
      priority_score: priority,
      recommended_message:
        priority > 0.75
          ? `Call customer regarding overdue invoice ${invoice.invoice_id} and request immediate payment plan.`
          : `Email reminder for overdue invoice ${invoice.invoice_id} with payment link and due amount ${invoice.amount_open}.`,
    };
  });

  const sdkResponse = await runWithAgentSdk(
    "Given aging invoices, return JSON array of collections actions with customer_id, invoice_id, action_type, priority_score, recommended_message.",
    JSON.stringify({ date, agingInvoices: agingInvoices.slice(0, 50) }),
  );

  if (sdkResponse) {
    try {
      const parsed = JSON.parse(sdkResponse) as Array<{
        customer_id: string;
        invoice_id: string;
        action_type: string;
        priority_score: number;
        recommended_message: string;
      }>;
      if (Array.isArray(parsed) && parsed.length > 0) {
        items = parsed.slice(0, 80);
      }
    } catch {
      // use deterministic output
    }
  }

  const created = await createCollectionActionsTool({
    items,
    created_by: "collections-agent",
  });

  return { date, created: created.length };
}

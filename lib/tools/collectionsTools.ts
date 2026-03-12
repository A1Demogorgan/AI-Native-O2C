import { createCollectionActions } from "@/lib/db/dao";
import { dbAll, escapeSqlString } from "@/lib/db/duckdb";
import type { Customer, Invoice } from "@/lib/types";

export async function listAgingInvoicesTool(limit = 200) {
  return dbAll<Invoice>(`
    SELECT *
    FROM invoices
    WHERE amount_open > 0 AND due_date < CURRENT_DATE
    ORDER BY due_date ASC
    LIMIT ${limit}
  `);
}

export async function getCustomerRiskTool(customerId: string) {
  return dbAll<Customer>(`SELECT * FROM customers WHERE customer_id = '${escapeSqlString(customerId)}' LIMIT 1`);
}

export async function createCollectionActionsTool(input: {
  items: Array<{
    customer_id: string;
    invoice_id: string;
    action_type: string;
    priority_score: number;
    recommended_message: string;
  }>;
  created_by: string;
}) {
  return createCollectionActions(input);
}

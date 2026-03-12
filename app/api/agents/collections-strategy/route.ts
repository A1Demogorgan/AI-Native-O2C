import { NextResponse } from "next/server";
import { z } from "zod";
import { getCustomer, getInvoice, listDisputesByInvoice } from "@/lib/db/dao";
import type { ReviewAgentResult } from "@/lib/types";

const schema = z.object({ invoice_id: z.string().min(1), date: z.string().optional() });

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  const invoice = await getInvoice(body.invoice_id);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  const customer = await getCustomer(invoice.customer_id);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  const disputes = await listDisputesByInvoice(invoice.invoice_id);
  const asOf = body.date ?? new Date().toISOString().slice(0, 10);
  const daysPastDue = Math.max(0, Math.floor((new Date(asOf).getTime() - new Date(invoice.due_date).getTime()) / 86400000));
  const amountOpen = Number(invoice.amount_open);
  const priorityScore = Number(
    (
      Math.min(
        1,
        customer.risk_score * 0.4 +
          Math.min(daysPastDue / 75, 1) * 0.35 +
          Math.min(amountOpen / 25000, 1) * 0.15 +
          (disputes.length > 0 ? 0.1 : 0),
      )
    ).toFixed(2),
  );
  const actionType =
    daysPastDue >= 45 || amountOpen >= 18000 || priorityScore >= 0.82
      ? "call_customer"
      : daysPastDue >= 15 || amountOpen >= 8000 || customer.segment === "Enterprise" || disputes.length > 0 || priorityScore >= 0.58
        ? "email_reminder"
        : "portal_reminder";
  const outreachPlan =
    actionType === "call_customer"
      ? "Call AP contact within 24 hours, confirm blockers, and secure a dated payment commitment."
      : actionType === "email_reminder"
        ? "Send reminder email with invoice detail, due amount, and a 3-day follow-up cadence."
        : "Send portal notification with balance detail and monitor for customer response.";

  const review: ReviewAgentResult = {
    subject_id: invoice.invoice_id,
    action_title: "Collections priority and outreach plan",
    action_summary: `Prioritize invoice ${invoice.invoice_id} with ${priorityScore >= 0.8 ? "high" : priorityScore >= 0.6 ? "medium" : "low"} urgency and start ${actionType.replaceAll("_", " ")} outreach.`,
    recommended_decision: actionType,
    facts: [
      { label: "Customer", value: customer.name },
      { label: "Invoice open amount", value: `$${amountOpen.toFixed(2)}` },
      { label: "Due date", value: invoice.due_date },
      { label: "Days past due", value: String(daysPastDue) },
      { label: "Customer risk", value: customer.risk_score.toFixed(2) },
      { label: "Priority score", value: priorityScore.toFixed(2) },
      { label: "Recommended channel", value: actionType.replaceAll("_", " ") },
    ],
    insights: [
      outreachPlan,
      disputes.length > 0 ? `${disputes.length} dispute(s) exist; keep collections message factual and avoid over-escalation.` : "No linked disputes; standard collections outreach is appropriate.",
    ],
    payload: {
      invoice_id: invoice.invoice_id,
      customer_id: invoice.customer_id,
      action_type: actionType,
      priority_score: priorityScore,
      recommended_message: outreachPlan,
    },
  };

  return NextResponse.json({ review });
}

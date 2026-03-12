import { NextResponse } from "next/server";
import { z } from "zod";
import { runCollectionsCommunicationsAgent } from "@/lib/agents/collectionsCommunicationsAgent";
import { getCustomer, getInvoice, getLatestCollectionActionByInvoice } from "@/lib/db/dao";
import type { ReviewAgentResult } from "@/lib/types";

export const runtime = "nodejs";

const schema = z.object({ invoice_id: z.string().min(1) });

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  const action = await getLatestCollectionActionByInvoice(body.invoice_id);
  if (!action) {
    return NextResponse.json({ error: "Collections action not found for invoice" }, { status: 404 });
  }

  const [customer, invoice] = await Promise.all([getCustomer(action.customer_id), getInvoice(action.invoice_id)]);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const proposal = runCollectionsCommunicationsAgent({ action, customer, invoice });
  const impact =
    action.priority_score >= 0.85 ? "High expected collection impact within 48 hours." : "Moderate expected collection impact over the next week.";
  const review: ReviewAgentResult = {
    subject_id: action.invoice_id,
    action_title: "Collections communication ready for approval",
    action_summary: proposal.subject_line,
    recommended_decision: proposal.channel,
    facts: [
      { label: "Customer", value: customer.name },
      { label: "Invoice", value: action.invoice_id },
      { label: "Collections action", value: action.action_id },
      { label: "Medium", value: proposal.channel },
      { label: "Format", value: proposal.tone },
      { label: "Expected impact", value: impact },
    ],
    insights: [proposal.message, proposal.next_step],
    payload: {
      ...proposal,
      action_id: action.action_id,
      invoice_id: action.invoice_id,
      expected_impact: impact,
    },
  };

  return NextResponse.json({ review });
}

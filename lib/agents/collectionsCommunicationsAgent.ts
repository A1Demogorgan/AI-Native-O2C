import type { CollectionsCommunicationProposal, CollectionAction, Customer, Invoice } from "@/lib/types";

export function runCollectionsCommunicationsAgent(input: {
  action: CollectionAction;
  customer: Customer;
  invoice: Invoice | null;
}): CollectionsCommunicationProposal {
  const amountOpen = input.invoice?.amount_open ?? 0;
  const tone: CollectionsCommunicationProposal["tone"] =
    input.action.priority_score >= 0.85 ? "firm" : input.customer.segment === "Enterprise" ? "relationship" : "neutral";
  const channel: CollectionsCommunicationProposal["channel"] =
    input.action.action_type === "call_customer"
      ? "phone"
      : input.action.action_type === "portal_reminder"
        ? "portal"
        : input.action.action_type === "email_reminder"
          ? "email"
          : input.customer.segment !== "Enterprise" && amountOpen < 10000
            ? "portal"
            : "email";

  return {
    action_id: input.action.action_id,
    channel,
    subject_line:
      channel === "phone"
        ? `Call script for invoice ${input.action.invoice_id}`
        : channel === "portal"
          ? `Portal reminder for invoice ${input.action.invoice_id}`
          : `Follow-up on invoice ${input.action.invoice_id}`,
    message:
      channel === "phone"
        ? `Call the AP contact regarding invoice ${input.action.invoice_id}. Confirm the remaining balance of ${amountOpen.toFixed(2)}, capture any blocker, and seek a dated payment commitment.`
        : channel === "portal"
          ? `Post a portal reminder for invoice ${input.action.invoice_id} showing the remaining balance of ${amountOpen.toFixed(2)} and request status confirmation in the customer portal.`
          : tone === "firm"
            ? `Please review invoice ${input.action.invoice_id}. An outstanding balance of ${amountOpen.toFixed(2)} remains due and requires immediate attention.`
            : `We are following up on invoice ${input.action.invoice_id}. Please let us know the payment status for the remaining balance of ${amountOpen.toFixed(2)}.`,
    tone,
    next_step:
      channel === "phone"
        ? "Log the call outcome and escalate internally if no payment date is secured."
        : channel === "portal"
          ? "Monitor the portal for acknowledgement and switch to email or phone if no response arrives within 72 hours."
          : tone === "firm"
            ? "Escalate to phone outreach if no response within 48 hours."
            : "Send reminder and monitor for response.",
  };
}

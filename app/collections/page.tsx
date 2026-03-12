"use client";

import SequentialReviewWorkspace from "@/components/sequential-review-workspace";

export default function CollectionsPage() {
  return (
    <section>
      <h2>Collections Strategy Agent</h2>
      <p>Review collections priorities one invoice at a time, then approve the outreach plan for operations.</p>
      <SequentialReviewWorkspace
        title="Collections Strategy"
        queueLabel="Invoices In Collections Scope"
        sourceEndpoint="/api/collections/strategy-queue"
        runEndpoint="/api/agents/collections-strategy"
        actionEndpoint="/api/agents/collections-strategy/action"
        idField="invoice_id"
        runButtonLabel="Run Collections Strategy Agent"
        requestBody={(row) => ({ invoice_id: String(row.invoice_id ?? ""), date: new Date().toISOString().slice(0, 10) })}
        columns={[
          { key: "invoice_id", label: "Invoice" },
          { key: "capture_id", label: "Capture" },
          { key: "customer_name", label: "Customer" },
          { key: "amount_open", label: "Open Amount" },
          { key: "days_past_due", label: "Days Past Due" },
        ]}
        actionOptions={(result) => [
          { label: "Approve Outreach Plan", decision: result.recommended_decision },
          { label: "Defer / Review Later", decision: "defer", secondary: true },
        ]}
      />
    </section>
  );
}

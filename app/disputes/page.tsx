"use client";

import SequentialReviewWorkspace from "@/components/sequential-review-workspace";

export default function DisputesPage() {
  return (
    <section>
      <h2>Dispute Triage & Resolution Agent</h2>
      <p>Run dispute triage case by case, review the facts, and confirm the next action.</p>
      <SequentialReviewWorkspace
        title="Dispute Triage"
        queueLabel="Open Disputes"
        sourceEndpoint="/api/disputes/open"
        runEndpoint="/api/agents/dispute-triage"
        actionEndpoint="/api/agents/dispute-triage/action"
        idField="dispute_id"
        runButtonLabel="Run Dispute Triage Agent"
        columns={[
          { key: "dispute_id", label: "Dispute" },
          { key: "capture_id", label: "Capture" },
          { key: "invoice_id", label: "Invoice" },
          { key: "amount_at_risk", label: "Amount at Risk" },
          { key: "status", label: "Status" },
        ]}
        actionOptions={() => [
          { label: "Mark In Review", decision: "in_review" },
          { label: "Resolve Dispute", decision: "resolve", secondary: true },
        ]}
      />
    </section>
  );
}

"use client";

import SequentialReviewWorkspace from "@/components/sequential-review-workspace";

export default function PaymentsPage() {
  return (
    <section>
      <h2>Cash Application Agent</h2>
      <p>Review customer-level payment matching proposals before applying cash across invoices.</p>
      <SequentialReviewWorkspace
        title="Cash Application"
        queueLabel="Customers With Unapplied Cash"
        sourceEndpoint="/api/customers/cash-application-queue"
        runEndpoint="/api/agents/cash-application"
        actionEndpoint="/api/agents/cash-application/apply"
        idField="customer_id"
        runButtonLabel="Run Cash Application Agent"
        requestBody={(row) => ({ customer_id: String(row.customer_id ?? "") })}
        actionBody={(result) => ({
          customer_id: result.subject_id,
          allocations: Array.isArray(result.payload.allocations) ? result.payload.allocations : [],
        })}
        columns={[
          { key: "customer_id", label: "Customer" },
          { key: "customer_name", label: "Name" },
          { key: "unapplied_payment_count", label: "Payments" },
          { key: "open_invoice_count", label: "Invoices" },
          { key: "unapplied_cash_total", label: "Unapplied Cash" },
          { key: "open_ar_total", label: "Open AR" },
        ]}
        actionOptions={() => [{ label: "Approve and Apply", decision: "apply" }]}
      />
    </section>
  );
}

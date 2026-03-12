import {
  getCreditRiskKpis,
  getHoldResolutionKpis,
  getInventoryAllocationKpis,
  getKpis,
  getOrderCaptureKpis,
  getOrderValidationKpis,
  getWorkflowAgentKpis,
  listAllocationEligibleOrders,
  listBillingQueueOrders,
  listCashApplicationQueueCustomers,
  listCollectionsCommunicationQueue,
  listCollectionsStrategyQueue,
  listCreditReviewQueueOrders,
  listHeldOrders,
  listInvoiceMatchingQueue,
  listOpenDisputes,
  listPaymentPredictionQueue,
  listShipmentPlanningQueueOrders,
  listValidationQueueOrders,
} from "@/lib/db/dao";

export type ConsultantMetric = {
  label: string;
  value: string;
};

export type ConsultantBrief = {
  areaId: string;
  areaLabel: string;
  promptTone: "red" | "amber" | "green";
  shouldPrompt: boolean;
  insightTitle: string;
  teaser: string;
  contextSummary: string;
  recommendations: string[];
  suggestedQuestions: string[];
  metrics: ConsultantMetric[];
};

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function money(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function num(value: number) {
  return value.toLocaleString();
}

function normalizeAreaId(areaIdInput: string) {
  return areaIdInput.trim().toLowerCase();
}

export async function buildConsultantBrief(areaIdInput: string, areaLabel?: string): Promise<ConsultantBrief> {
  const areaId = normalizeAreaId(areaIdInput);

  switch (areaId) {
    case "order-capture": {
      const [kpis, queue] = await Promise.all([getOrderCaptureKpis(), getKpis()]);
      const shouldPrompt = kpis.stp_rate < 0.8 || kpis.order_accuracy < 0.9;
      return {
        areaId,
        areaLabel: areaLabel ?? "Order Capture Agent",
        promptTone: shouldPrompt ? "amber" : "green",
        shouldPrompt,
        insightTitle: shouldPrompt ? "Capture quality is dragging downstream flow" : "Capture flow is stable",
        teaser: shouldPrompt
          ? "Low straight-through processing is likely creating avoidable review work downstream."
          : "Capture performance is stable. I can still suggest ways to reduce manual entry further.",
        contextSummary: `Straight-through processing is ${pct(kpis.stp_rate)} and extraction accuracy is ${pct(kpis.order_accuracy)}.`,
        recommendations: [
          "Tighten extraction prompts around PO number, requested date, and line quantity to reduce manual review.",
          "Prioritize mailbox patterns with lower confidence so cycle time improves before validation.",
          `Use capture confidence to predict which orders will become exceptions before they hit validation.`,
        ],
        suggestedQuestions: [
          "Which capture fields are hurting straight-through processing the most?",
          "Where can I cut order entry time further?",
          "What early signals suggest future validation failures?",
        ],
        metrics: [
          { label: "STP Rate", value: pct(kpis.stp_rate) },
          { label: "Order Accuracy", value: pct(kpis.order_accuracy) },
          { label: "Unapplied Cash", value: money(queue.unapplied_cash) },
        ],
      };
    }
    case "order-validation": {
      const [kpis, queue] = await Promise.all([getOrderValidationKpis(), listValidationQueueOrders(200)]);
      const shouldPrompt = queue.length > 12 || kpis.order_error_rate > 0.12;
      return {
        areaId,
        areaLabel: areaLabel ?? "Order Validation Agent",
        promptTone: queue.length > 20 || kpis.order_error_rate > 0.18 ? "red" : shouldPrompt ? "amber" : "green",
        shouldPrompt,
        insightTitle: shouldPrompt ? "Validation queue is becoming a cycle-time bottleneck" : "Validation is under control",
        teaser: shouldPrompt
          ? `${num(queue.length)} orders are waiting for validation, and error rate is ${pct(kpis.order_error_rate)}.`
          : "Validation health is stable. I can still highlight segments most likely to fail next.",
        contextSummary: `Validation queue has ${num(queue.length)} orders. Pricing accuracy is ${pct(kpis.pricing_accuracy)}.`,
        recommendations: [
          "Cluster repeated validation failures by customer and SKU to remove recurring manual touches.",
          "Pre-clear common pricing exceptions for strategic accounts to reduce order cycle time.",
          "Use validation defect patterns to predict which customers are likely to submit incomplete orders.",
        ],
        suggestedQuestions: [
          "Which customers create the most validation rework?",
          "How do I improve pricing accuracy fastest?",
          "What can I automate to reduce validation backlog?",
        ],
        metrics: [
          { label: "Queue", value: num(queue.length) },
          { label: "Error Rate", value: pct(kpis.order_error_rate) },
          { label: "Pricing Accuracy", value: pct(kpis.pricing_accuracy) },
        ],
      };
    }
    case "credit-risk": {
      const [kpis, queue] = await Promise.all([getCreditRiskKpis(), listCreditReviewQueueOrders(200)]);
      const shouldPrompt = queue.length > 10 || kpis.revenue_at_risk > 150000;
      return {
        areaId,
        areaLabel: areaLabel ?? "Credit Risk Agent",
        promptTone: kpis.revenue_at_risk > 250000 ? "red" : shouldPrompt ? "amber" : "green",
        shouldPrompt,
        insightTitle: shouldPrompt ? "Credit review is holding too much revenue" : "Credit exposure is manageable",
        teaser: shouldPrompt
          ? `Revenue at risk is ${money(kpis.revenue_at_risk)} across ${num(queue.length)} credit reviews.`
          : "Credit queue is manageable. I can still identify segments likely to move into hold next.",
        contextSummary: `Credit approval proxy is ${kpis.credit_approval_time_minutes.toFixed(1)} minutes with bad debt proxy at ${pct(kpis.bad_debt_proxy_rate)}.`,
        recommendations: [
          "Separate fast-track renewals from first-time or deteriorating accounts to shorten approval time.",
          "Use payment behavior and dispute history together when predicting which customers are likely to slip into hold.",
          "Target conditional releases at high-value low-default accounts to protect top line without overextending credit.",
        ],
        suggestedQuestions: [
          "Which customers are most likely to move from approval to hold next?",
          "How can I reduce credit approval time without raising bad debt risk?",
          "Where is revenue most exposed in the current credit queue?",
        ],
        metrics: [
          { label: "Queue", value: num(queue.length) },
          { label: "Revenue At Risk", value: money(kpis.revenue_at_risk) },
          { label: "Bad Debt Proxy", value: pct(kpis.bad_debt_proxy_rate) },
        ],
      };
    }
    case "hold-resolution": {
      const [kpis, queue] = await Promise.all([getHoldResolutionKpis(), listHeldOrders(200)]);
      const shouldPrompt = queue.length > 8 || kpis.revenue_delay > 100000;
      return {
        areaId,
        areaLabel: areaLabel ?? "Hold Resolution Agent",
        promptTone: queue.length > 15 ? "red" : shouldPrompt ? "amber" : "green",
        shouldPrompt,
        insightTitle: shouldPrompt ? "Held orders are delaying revenue conversion" : "Hold resolution queue is stable",
        teaser: shouldPrompt
          ? `${num(queue.length)} held orders are delaying ${money(kpis.revenue_delay)} of revenue.`
          : "Hold resolution is stable. I can still point out which holds are easiest to cure quickly.",
        contextSummary: `Average hold duration proxy is ${kpis.hold_duration_days.toFixed(1)} days with ${num(kpis.manual_touches)} manual touches.`,
        recommendations: [
          "Triage holds by cure difficulty so low-friction releases move first and top-line impact improves sooner.",
          "Feed repeat hold causes back into validation and credit policy to reduce future cycle-time loss.",
          "Use hold patterns to predict which customers will require prepayment or conditional release next quarter.",
        ],
        suggestedQuestions: [
          "Which holds can be released fastest?",
          "What recurring hold reasons are hurting cycle time most?",
          "Which customers are likely to trigger holds again?",
        ],
        metrics: [
          { label: "Held Orders", value: num(queue.length) },
          { label: "Revenue Delay", value: money(kpis.revenue_delay) },
          { label: "Hold Duration", value: `${kpis.hold_duration_days.toFixed(1)}d` },
        ],
      };
    }
    case "inventory-allocation": {
      const [kpis, queue] = await Promise.all([getInventoryAllocationKpis(), listAllocationEligibleOrders(200)]);
      const shouldPrompt = queue.length > 10 || kpis.stockout_rate > 0.12;
      return {
        areaId,
        areaLabel: areaLabel ?? "Inventory & Allocation Agent",
        promptTone: kpis.stockout_rate > 0.2 ? "red" : shouldPrompt ? "amber" : "green",
        shouldPrompt,
        insightTitle: shouldPrompt ? "Allocation risk is starting to threaten service levels" : "Allocation flow is healthy",
        teaser: shouldPrompt
          ? `Stockout rate is ${pct(kpis.stockout_rate)} and ${num(queue.length)} orders are awaiting allocation.`
          : "Allocation risk is under control. I can still identify customers most likely to accept substitutes or splits.",
        contextSummary: `Current fill rate is ${pct(kpis.fill_rate)} with backorder age proxy at ${kpis.backorder_age_days.toFixed(1)} days.`,
        recommendations: [
          "Use customer segment and order value together when deciding whether to substitute, split, or backorder.",
          "Shorten cycle time by pre-allocating constrained SKUs to customers with higher conversion value.",
          "Predict future demand for similar customers to reduce repeat stockouts on common product mixes.",
        ],
        suggestedQuestions: [
          "Which shortages are hurting top line the most?",
          "Who is most likely to accept a substitute?",
          "What should I pre-allocate to reduce backorders next week?",
        ],
        metrics: [
          { label: "Queue", value: num(queue.length) },
          { label: "Fill Rate", value: pct(kpis.fill_rate) },
          { label: "Stockout Rate", value: pct(kpis.stockout_rate) },
        ],
      };
    }
    case "shipment-planning":
    case "billing-intelligence":
    case "invoice-matching":
    case "payment-prediction":
    case "collections-communications": {
      const [workflow, queueSize] = await Promise.all([
        getWorkflowAgentKpis(areaId),
        areaId === "shipment-planning"
          ? listShipmentPlanningQueueOrders(200).then((rows) => rows.length)
          : areaId === "billing-intelligence"
            ? listBillingQueueOrders(200).then((rows) => rows.length)
            : areaId === "invoice-matching"
              ? listInvoiceMatchingQueue(200).then((rows) => rows.length)
              : areaId === "payment-prediction"
                ? listPaymentPredictionQueue(200).then((rows) => rows.length)
                : listCollectionsCommunicationQueue(200).then((rows) => rows.length),
      ]);
      const labels: Record<string, string> = {
        "shipment-planning": "Shipment Planning Agent",
        "billing-intelligence": "Billing Intelligence Agent",
        "invoice-matching": "Invoice Matching Agent",
        "payment-prediction": "Payment Prediction Agent",
        "collections-communications": "Collections Communications Agent",
      };
      const queueNames: Record<string, string> = {
        "shipment-planning": "shipment planning",
        "billing-intelligence": "billing review",
        "invoice-matching": "3-way match",
        "payment-prediction": "payment prediction",
        "collections-communications": "collections outreach",
      };
      const shouldPrompt = queueSize > 10 || workflow.exception_rate > 0.15;
      return {
        areaId,
        areaLabel: areaLabel ?? labels[areaId],
        promptTone: workflow.exception_rate > 0.25 ? "red" : shouldPrompt ? "amber" : "green",
        shouldPrompt,
        insightTitle: shouldPrompt ? `${labels[areaId]} has avoidable exception drag` : `${labels[areaId]} is stable`,
        teaser: shouldPrompt
          ? `${num(queueSize)} items are in ${queueNames[areaId]} with exception rate at ${pct(workflow.exception_rate)}.`
          : `This stage is steady. I can still point out where to improve throughput and predict follow-on risk.`,
        contextSummary: `${labels[areaId]} has ${num(queueSize)} active items and ${num(workflow.action_count)} historical actions.`,
        recommendations: [
          "Separate repeatable low-risk items from exception-heavy items so humans focus on the highest-value decisions.",
          "Use exception patterns here to predict downstream delay before it impacts DSO or customer service.",
          "Link this stage’s outcomes back to customer segment and product mix to improve both throughput and top-line realization.",
        ],
        suggestedQuestions: [
          "What is driving exceptions in this stage?",
          "How can I improve throughput here without increasing risk?",
          "What downstream metric is most exposed from this queue?",
        ],
        metrics: [
          { label: "Queue", value: num(queueSize) },
          { label: "Exception Rate", value: pct(workflow.exception_rate) },
          { label: "Actions", value: num(workflow.action_count) },
        ],
      };
    }
    case "collections-strategy": {
      const [queue, kpis] = await Promise.all([listCollectionsStrategyQueue(200), getKpis()]);
      const overdue = queue.filter((row) => Number(row.days_past_due ?? 0) > 30).length;
      const shouldPrompt = queue.length > 10 || overdue > 6;
      return {
        areaId,
        areaLabel: areaLabel ?? "Collections Strategy Agent",
        promptTone: overdue > 10 ? "red" : shouldPrompt ? "amber" : "green",
        shouldPrompt,
        insightTitle: shouldPrompt ? "Collections prioritization can materially improve DSO" : "Collections queue is manageable",
        teaser: shouldPrompt
          ? `${num(overdue)} invoices are beyond 30 days past due. Prioritization here can move DSO faster than broad outreach.`
          : "Collections scope is balanced. I can still suggest which customer segments deserve different outreach tactics.",
        contextSummary: `${num(queue.length)} invoices are in collections scope and current auto-match proxy is ${pct(kpis.auto_match_rate)}.`,
        recommendations: [
          "Prioritize by days past due, balance size, and customer risk together instead of balance alone.",
          "Reserve phone outreach for larger or older balances; keep lower-friction segments on email or portal to protect team capacity.",
          "Use payment behavior of similar customers to predict which open invoices need early intervention before DSO worsens.",
        ],
        suggestedQuestions: [
          "Which invoices should I escalate first to improve DSO?",
          "What outreach mix should I use by customer segment?",
          "Which customers are most likely to pay without a call?",
        ],
        metrics: [
          { label: "Queue", value: num(queue.length) },
          { label: ">30 DPD", value: num(overdue) },
          { label: "Unapplied Cash", value: money(kpis.unapplied_cash) },
        ],
      };
    }
    case "cash-application": {
      const [queue, kpis] = await Promise.all([listCashApplicationQueueCustomers(200), getKpis()]);
      const totalUnapplied = queue.reduce((sum, row) => sum + Number(row.unapplied_cash_total ?? 0), 0);
      const shouldPrompt = totalUnapplied > 100000 || queue.length > 8;
      return {
        areaId,
        areaLabel: areaLabel ?? "Cash Application Agent",
        promptTone: totalUnapplied > 175000 ? "red" : shouldPrompt ? "amber" : "green",
        shouldPrompt,
        insightTitle: shouldPrompt ? "Unapplied cash is slowing collections clarity and DSO improvement" : "Cash application is under control",
        teaser: shouldPrompt
          ? `${money(totalUnapplied)} of unapplied cash is sitting across ${num(queue.length)} customers.`
          : "Cash application is stable. I can still identify customers where matching can be automated further.",
        contextSummary: `${pct(kpis.auto_match_rate)} of payments are auto-matched with ${money(kpis.unapplied_cash)} still unapplied.`,
        recommendations: [
          "Clear high-value unapplied cash first because it improves AR visibility and reduces false collections effort.",
          "Use remittance and customer payment pattern matching to predict multi-invoice and multi-payment allocation candidates.",
          "Feed consistent match patterns back into automation rules to improve DSO with less analyst effort.",
        ],
        suggestedQuestions: [
          "Which customers should I clear first to improve DSO fastest?",
          "Where can I automate cash matching more aggressively?",
          "Which payment patterns repeat often enough to template?",
        ],
        metrics: [
          { label: "Customers", value: num(queue.length) },
          { label: "Unapplied Cash", value: money(totalUnapplied) },
          { label: "Auto Match", value: pct(kpis.auto_match_rate) },
        ],
      };
    }
    case "dispute-triage-resolution": {
      const [queue, kpis] = await Promise.all([listOpenDisputes(200), getKpis()]);
      const shouldPrompt = queue.length > 8 || kpis.dispute_rate > 0.08;
      return {
        areaId,
        areaLabel: areaLabel ?? "Dispute Triage & Resolution Agent",
        promptTone: queue.length > 15 ? "red" : shouldPrompt ? "amber" : "green",
        shouldPrompt,
        insightTitle: shouldPrompt ? "Open disputes are locking revenue and extending DSO" : "Dispute volume is controlled",
        teaser: shouldPrompt
          ? `${num(queue.length)} disputes remain open, with dispute rate at ${pct(kpis.dispute_rate)}.`
          : "Dispute load is stable. I can still show which issue types recur and how to reduce them upstream.",
        contextSummary: `${num(queue.length)} open disputes remain in the queue and current dispute rate is ${pct(kpis.dispute_rate)}.`,
        recommendations: [
          "Separate operational disputes from commercial disputes so resolution owners are clearer and revenue unlocks faster.",
          "Use dispute categories to identify which upstream process area is hurting top-line realization most.",
          "Predict future dispute likelihood by customer, SKU mix, and shipment pattern so risky orders can be handled earlier.",
        ],
        suggestedQuestions: [
          "Which dispute types are hurting revenue the most?",
          "What upstream fixes would reduce disputes fastest?",
          "Which customers are most likely to dispute future invoices?",
        ],
        metrics: [
          { label: "Open Disputes", value: num(queue.length) },
          { label: "Dispute Rate", value: pct(kpis.dispute_rate) },
          { label: "DSO", value: `${kpis.dso_proxy.toFixed(1)}d` },
        ],
      };
    }
    default: {
      const kpis = await getKpis();
      const shouldPrompt = kpis.dispute_rate > 0.08 || kpis.unapplied_cash > 100000;
      return {
        areaId,
        areaLabel: areaLabel ?? "O2C Consultant",
        promptTone: shouldPrompt ? "amber" : "green",
        shouldPrompt,
        insightTitle: shouldPrompt ? "Portfolio-wide friction is worth addressing now" : "O2C portfolio is broadly stable",
        teaser: shouldPrompt
          ? `Dispute rate is ${pct(kpis.dispute_rate)} and unapplied cash is ${money(kpis.unapplied_cash)}.`
          : "Performance is steady. I can still suggest ways to improve cycle time, top line, and DSO.",
        contextSummary: `Order cycle time proxy is ${kpis.dso_proxy.toFixed(1)} days and DSO proxy is ${kpis.dso_proxy.toFixed(1)} days.`,
        recommendations: [
          "Focus on cross-stage drivers that repeatedly create holds, billing issues, and disputes.",
          "Use customer-level patterns to predict order demand, payment timing, and preferred resolution channels.",
          "Improve top line and cash conversion together by prioritizing revenue-at-risk segments with fast operational cures.",
        ],
        suggestedQuestions: [
          "What is hurting O2C cycle time the most right now?",
          "Where can I improve DSO fastest?",
          "What do similar customers tend to order or prefer?",
        ],
        metrics: [
          { label: "Cycle Time Proxy", value: `${kpis.dso_proxy.toFixed(1)}d` },
          { label: "DSO Proxy", value: `${kpis.dso_proxy.toFixed(1)}d` },
          { label: "Dispute Rate", value: pct(kpis.dispute_rate) },
        ],
      };
    }
  }
}

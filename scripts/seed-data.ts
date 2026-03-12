// @ts-nocheck
import duckdb from "duckdb";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), "data", "o2c.duckdb");
const BASE_TIME = Date.parse("2026-03-10T09:00:00.000Z");
const QUEUE_SIZE = 20;

const SKU_CATALOG = {
  "HTL-KING-PLUSH": 281,
  "HTL-QUEEN-FIRM": 233,
  "HTL-KING-HYBRID": 410,
  "HTL-TWIN-FIRM": 171,
  "HTL-CAL-KING-PREMIUM": 349,
  "HTL-QUEEN-PREMIUM": 291,
};

const SEGMENTS = ["Enterprise", "MidMarket", "SMB"];
const CITIES = [
  "Boston, MA",
  "Chicago, IL",
  "Las Vegas, NV",
  "Miami, FL",
  "Denver, CO",
  "Austin, TX",
  "Phoenix, AZ",
  "Nashville, TN",
  "Seattle, WA",
  "Atlanta, GA",
];

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new duckdb.Database(DB_PATH);

function dbExec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function esc(value) {
  return String(value).replace(/'/g, "''");
}

function sql(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  return `'${esc(value)}'`;
}

function json(value) {
  return sql(JSON.stringify(value));
}

function pad(value, size = 3) {
  return String(value).padStart(size, "0");
}

function iso(minutesFromBase) {
  return new Date(BASE_TIME + minutesFromBase * 60_000).toISOString();
}

function day(offsetDays) {
  return new Date(BASE_TIME + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function shiftDate(dateString, deltaDays) {
  const next = new Date(`${dateString}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + deltaDays);
  return next.toISOString().slice(0, 10);
}

function sumLineItems(lineItems) {
  return Number(
    lineItems.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0).toFixed(2),
  );
}

function buildLineItems(index, profile = "standard") {
  if (profile === "premium") {
    return [
      { sku: "HTL-CAL-KING-PREMIUM", quantity: 12 + (index % 5) * 2, unit_price: SKU_CATALOG["HTL-CAL-KING-PREMIUM"] },
      { sku: "HTL-QUEEN-PREMIUM", quantity: 10 + (index % 4) * 2, unit_price: SKU_CATALOG["HTL-QUEEN-PREMIUM"] },
    ];
  }

  if (profile === "hybrid") {
    return [
      { sku: "HTL-KING-HYBRID", quantity: 8 + (index % 4) * 2, unit_price: SKU_CATALOG["HTL-KING-HYBRID"] },
      { sku: "HTL-QUEEN-FIRM", quantity: 10 + (index % 5) * 2, unit_price: SKU_CATALOG["HTL-QUEEN-FIRM"] },
    ];
  }

  if (profile === "twin") {
    return [{ sku: "HTL-TWIN-FIRM", quantity: 30 + (index % 6) * 4, unit_price: SKU_CATALOG["HTL-TWIN-FIRM"] }];
  }

  const families = [
    [{ sku: "HTL-KING-PLUSH", quantity: 14 + (index % 5) * 2, unit_price: SKU_CATALOG["HTL-KING-PLUSH"] }],
    [{ sku: "HTL-QUEEN-FIRM", quantity: 16 + (index % 6) * 2, unit_price: SKU_CATALOG["HTL-QUEEN-FIRM"] }],
    [
      { sku: "HTL-KING-PLUSH", quantity: 10 + (index % 4) * 2, unit_price: SKU_CATALOG["HTL-KING-PLUSH"] },
      { sku: "HTL-QUEEN-FIRM", quantity: 12 + (index % 3) * 2, unit_price: SKU_CATALOG["HTL-QUEEN-FIRM"] },
    ],
    [
      { sku: "HTL-KING-HYBRID", quantity: 6 + (index % 4) * 2, unit_price: SKU_CATALOG["HTL-KING-HYBRID"] },
      { sku: "HTL-TWIN-FIRM", quantity: 18 + (index % 4) * 2, unit_price: SKU_CATALOG["HTL-TWIN-FIRM"] },
    ],
  ];
  return families[index % families.length];
}

function makeCustomer(group, index, opts = {}) {
  const customerId = opts.customer_id ?? `CUST-${group}-${pad(index)}`;
  const name = opts.name ?? `${group} Hospitality ${pad(index)}`;
  return {
    customer_id: customerId,
    name,
    segment: opts.segment ?? SEGMENTS[(index - 1) % SEGMENTS.length],
    credit_limit: opts.credit_limit ?? 70_000 + index * 4_000,
    payment_terms_days: opts.payment_terms_days ?? [15, 30, 45, 60][index % 4],
    risk_score: opts.risk_score ?? Number((0.18 + (index % 9) * 0.07).toFixed(3)),
    created_at: opts.created_at ?? iso(-(600 + index)),
    email: opts.email ?? `ap-${group.toLowerCase()}-${pad(index)}@example.com`,
  };
}

function makeOrder(group, index, customer, createdMinutes, opts = {}) {
  const lineItems = opts.line_items ?? buildLineItems(index, opts.profile);
  const totalAmount = opts.total_amount ?? sumLineItems(lineItems);
  return {
    capture_id: opts.capture_id ?? `ORDCAP-${group}-${pad(index)}`,
    source: opts.source ?? (index % 4 === 0 ? "chat" : "email"),
    customer_name: opts.customer_name ?? customer.name,
    customer_email: opts.customer_email ?? customer.email,
    po_number: opts.po_number ?? `${group}-PO-${pad(index, 4)}`,
    requested_date: opts.requested_date ?? day(7 + (index % 9)),
    ship_to: opts.ship_to ?? CITIES[(index - 1) % CITIES.length],
    currency: "USD",
    total_amount: totalAmount,
    line_items: lineItems,
    extraction_confidence: opts.extraction_confidence ?? 0.97,
    requires_review: opts.requires_review ?? false,
    processing_seconds: opts.processing_seconds ?? Number((8 + (index % 5) * 1.7).toFixed(1)),
    created_by: "seed-script",
    created_at: iso(createdMinutes),
  };
}

function lineResultsFromOrder(order, opts = {}) {
  return order.line_items.map((item, idx) => {
    const allocatedQty = opts.partial && idx === 0 ? Math.max(item.quantity - opts.partial, 1) : item.quantity;
    const backorderedQty = item.quantity - allocatedQty;
    return {
      sku: item.sku,
      ordered_qty: item.quantity,
      allocated_qty: allocatedQty,
      backordered_qty: backorderedQty,
      status: backorderedQty > 0 ? "partial" : "allocated",
      source_location: opts.locations?.[idx] ?? ["Dallas DC", "Atlanta DC", "Chicago DC"][idx % 3],
      substitute_sku: null,
      proposed_ship_date: backorderedQty > 0 ? shiftDate(order.requested_date, 3) : order.requested_date,
      rationale: backorderedQty > 0 ? "Inbound supply required for remainder." : "Inventory available for release.",
    };
  });
}

async function insertValues(table, values) {
  if (values.length === 0) {
    return;
  }
  const batchSize = 25;
  for (let index = 0; index < values.length; index += batchSize) {
    const batch = values.slice(index, index + batchSize);
    await dbExec(`INSERT INTO ${table} VALUES ${batch.join(",")};`);
  }
}

function buildRows() {
  const rows = {
    customers: [],
    contractSnapshots: [],
    orders: [],
    validations: [],
    credits: [],
    holds: [],
    inventoryPositions: [],
    allocations: [],
    workflowActions: [],
    invoices: [],
    payments: [],
    paymentAllocations: [],
    collections: [],
    disputes: [],
    journeys: [],
    insights: [],
  };

  function pushCustomer(customer) {
    rows.customers.push(
      `(${sql(customer.customer_id)},${sql(customer.name)},${sql(customer.segment)},${sql(customer.credit_limit)},${sql(customer.payment_terms_days)},${sql(customer.risk_score)},${sql(customer.created_at)})`,
    );
  }

  function pushOrder(order) {
    rows.orders.push(
      `(${sql(order.capture_id)},${sql(order.source)},${sql(order.customer_name)},${sql(order.customer_email)},${sql(order.po_number)},${sql(order.requested_date)},${sql(order.ship_to)},${sql(order.currency)},${sql(order.total_amount)},${json(order.line_items)},${sql(order.extraction_confidence)},${sql(order.requires_review)},${sql(order.processing_seconds)},${sql(order.created_by)},${sql(order.created_at)})`,
    );
  }

  function pushContractSnapshot(contractSnapshotId, order, customer, createdAt, opts = {}) {
    const commercialTerms = {
      payment_terms_days: opts.payment_terms_days ?? customer.payment_terms_days,
      freight_term: opts.freight_term ?? "FOB Destination",
      billing_basis: opts.billing_basis ?? "Shipped quantity",
      contract_clause_ref: opts.contract_clause_ref ?? `MSA-${customer.customer_id}`,
      price_lock: opts.price_lock ?? "Contracted unit pricing in force",
    };
    rows.contractSnapshots.push(
      `(${sql(contractSnapshotId)},${sql(order.capture_id)},${sql(customer.customer_id)},${sql(opts.contract_id ?? `CTR-${customer.customer_id}`)},${sql(opts.effective_date ?? shiftDate(order.requested_date, -60))},${sql(opts.expiration_date ?? shiftDate(order.requested_date, 180))},${sql(opts.payment_terms_days ?? customer.payment_terms_days)},${sql(order.currency)},${sql(opts.total_amount ?? order.total_amount)},${json(opts.line_items ?? order.line_items)},${json(commercialTerms)},${sql(opts.source_summary ?? `Contract snapshot for ${order.capture_id}`)},${sql(createdAt)})`,
    );
  }

  function pushValidation(actionId, captureId, order, action, createdAt, discrepancies = []) {
    const draft = {
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      po_number: order.po_number,
      requested_date: order.requested_date,
      ship_to: order.ship_to,
      currency: order.currency,
      total_amount: order.total_amount,
      line_items: order.line_items,
    };
    rows.validations.push(
      `(${sql(actionId)},${sql(captureId)},${sql(action)},${json(draft)},${json(draft)},${json(discrepancies)},${sql("seed-validation")},${sql(createdAt)})`,
    );
  }

  function pushCredit(actionId, captureId, decision, finalDecision, riskScore, revenueAtRisk, badDebtDelta, rationale, createdAt) {
    rows.credits.push(
      `(${sql(actionId)},${sql(captureId)},${sql(decision)},${sql(finalDecision)},${sql(riskScore)},${sql(revenueAtRisk)},${sql(badDebtDelta)},${json(rationale)},${sql("")},${sql("seed-credit-risk")},${sql(createdAt)})`,
    );
  }

  function pushHold(actionId, captureId, decision, finalDecision, ownerTeam, summary, createdAt) {
    rows.holds.push(
      `(${sql(actionId)},${sql(captureId)},${sql(decision)},${sql(finalDecision)},${sql(ownerTeam)},${sql(summary)},${sql("seed-hold-resolution")},${sql(createdAt)})`,
    );
  }

  function pushInventoryAction(actionId, captureId, recommendedDecision, finalDecision, fillRate, revenueAtRisk, summary, lineResults, createdAt) {
    rows.allocations.push(
      `(${sql(actionId)},${sql(captureId)},${sql(recommendedDecision)},${sql(finalDecision)},${sql(fillRate)},${sql(revenueAtRisk)},${sql(summary)},${json(lineResults)},${sql("seed-inventory")},${sql(createdAt)})`,
    );
  }

  function pushWorkflowAction(actionId, agentId, subjectType, subjectId, recommendedDecision, finalDecision, summary, payload, createdAt) {
    rows.workflowActions.push(
      `(${sql(actionId)},${sql(agentId)},${sql(subjectType)},${sql(subjectId)},${sql(recommendedDecision)},${sql(finalDecision)},${sql(summary)},${json(payload)},${sql("seed-workflow")},${sql(createdAt)})`,
    );
  }

  function pushInvoice(invoiceId, customerId, invoiceDate, dueDate, amountTotal, amountOpen, status) {
    rows.invoices.push(
      `(${sql(invoiceId)},${sql(customerId)},${sql(invoiceDate)},${sql(dueDate)},${sql(amountTotal)},${sql(amountOpen)},${sql(status)})`,
    );
  }

  function pushPayment(paymentId, customerId, paymentDate, amountTotal, amountUnapplied, paymentRef, remittanceText) {
    rows.payments.push(
      `(${sql(paymentId)},${sql(customerId)},${sql(paymentDate)},${sql(amountTotal)},${sql(amountUnapplied)},${sql(paymentRef)},${sql(remittanceText)})`,
    );
  }

  function pushPaymentAllocation(allocationId, paymentId, invoiceId, amount, confidence, rationale, createdAt) {
    rows.paymentAllocations.push(
      `(${sql(allocationId)},${sql(paymentId)},${sql(invoiceId)},${sql(amount)},${sql(confidence)},${sql(rationale)},${sql("seed-cash-application")},${sql(createdAt)})`,
    );
  }

  function pushCollection(actionId, customerId, invoiceId, actionType, priorityScore, recommendedMessage, status, createdAt) {
    rows.collections.push(
      `(${sql(actionId)},${sql(customerId)},${sql(invoiceId)},${sql(actionType)},${sql(priorityScore)},${sql(recommendedMessage)},${sql(status)},${sql("seed-collections")},${sql(createdAt)})`,
    );
  }

  function pushDispute(disputeId, invoiceId, customerId, disputeType, description, amountAtRisk, status, evidenceSummary, createdAt, resolvedAt) {
    rows.disputes.push(
      `(${sql(disputeId)},${sql(invoiceId)},${sql(customerId)},${sql(disputeType)},${sql(description)},${sql(amountAtRisk)},${sql(status)},${sql(evidenceSummary)},${sql(createdAt)},${sql(resolvedAt)})`,
    );
  }

  function pushJourney(captureId, customerId, invoiceId, paymentId, collectionActionId, disputeId, goldenTag, storyline, lifecycleStatus, resolvedAt) {
    rows.journeys.push(
      `(${sql(captureId)},${sql(customerId)},${sql(invoiceId)},${sql(paymentId)},${sql(collectionActionId)},${sql(disputeId)},${sql(goldenTag)},${sql(storyline)},${sql(lifecycleStatus)},${sql(resolvedAt)})`,
    );
  }

  function pushInsight(insightId, agentId, insightType, subjectId, severity, title, summary, payload, createdAt) {
    rows.insights.push(
      `(${sql(insightId)},${sql(agentId)},${sql(insightType)},${sql(subjectId)},${sql(severity)},${sql(title)},${sql(summary)},${json(payload)},${sql("seed-insights")},${sql(createdAt)})`,
    );
  }

  const inventoryPositions = [
    ["INV-POS-001", "HTL-KING-PLUSH", "Dallas DC", 540, 60, 480, 0, null, iso(-50)],
    ["INV-POS-002", "HTL-KING-PLUSH", "Atlanta DC", 210, 20, 190, 0, null, iso(-50)],
    ["INV-POS-003", "HTL-QUEEN-FIRM", "Atlanta DC", 620, 40, 580, 0, null, iso(-50)],
    ["INV-POS-004", "HTL-KING-HYBRID", "Chicago DC", 330, 30, 300, 80, day(5), iso(-50)],
    ["INV-POS-005", "HTL-TWIN-FIRM", "Phoenix DC", 880, 50, 830, 0, null, iso(-50)],
    ["INV-POS-006", "HTL-CAL-KING-PREMIUM", "Dallas DC", 42, 6, 36, 70, day(4), iso(-50)],
    ["INV-POS-007", "HTL-QUEEN-PREMIUM", "Chicago DC", 48, 8, 40, 60, day(3), iso(-50)],
    ["INV-POS-008", "HTL-QUEEN-FIRM", "Seattle DC", 260, 18, 242, 0, null, iso(-50)],
    ["INV-POS-009", "HTL-KING-HYBRID", "Nashville DC", 160, 12, 148, 0, null, iso(-50)],
  ];

  for (const position of inventoryPositions) {
    rows.inventoryPositions.push(
      `(${sql(position[0])},${sql(position[1])},${sql(position[2])},${sql(position[3])},${sql(position[4])},${sql(position[5])},${sql(position[6])},${sql(position[7])},${sql(position[8])})`,
    );
  }

  const goldenOrders = [
    {
      index: 1,
      golden_tag: "GOLDEN-ORDER-1",
      customer: makeCustomer("GOLD", 1, {
        customer_id: "CUST-GOLD-001",
        name: "Golden Harbor Boston",
        email: "ap-golden-harbor@example.com",
        credit_limit: 250000,
        payment_terms_days: 30,
        risk_score: 0.24,
      }),
      order: {
        capture_id: "ORDCAP-GOLD-001",
        profile: "standard",
        storyline: "Clean order-to-cash path with later pricing variance that gets resolved.",
      },
      credit: { decision: "approve", final: "approve", risk: 28.4, revenue: 2140.8, badDebt: 312.4, rationale: ["Risk within policy threshold."] },
      allocation: { recommended: "allocate_full", fill_rate: 1, revenue_at_risk: 0 },
      shipment: { recommended: "scheduled", final: "scheduled", status: "scheduled" },
      billing: { recommended: "ready_to_invoice", final: "ready_to_invoice", status: "ready_to_invoice" },
      invoiceMatching: { recommended: "matched", final: "matched" },
      paymentPrediction: { recommended: "low", final: "low" },
      collectionsComms: { recommended: "email", final: "send" },
      invoice_status: "paid",
      dispute: { type: "pricing", status: "resolved", amount: 1240, evidence: "Contract price exception approved and credit memo posted." },
    },
    {
      index: 2,
      golden_tag: "GOLDEN-ORDER-2",
      customer: makeCustomer("GOLD", 2, {
        customer_id: "CUST-GOLD-002",
        name: "Golden Lotus Chicago",
        email: "ap-golden-lotus@example.com",
        credit_limit: 180000,
        payment_terms_days: 45,
        risk_score: 0.63,
      }),
      order: {
        capture_id: "ORDCAP-GOLD-002",
        profile: "hybrid",
        storyline: "Credit hold cured through hold resolution, then completed and disputed delivery variance resolved.",
      },
      credit: {
        decision: "hold",
        final: "hold",
        risk: 82.9,
        revenue: 8160,
        badDebt: 1224,
        rationale: ["Projected utilization exceeds limit and open AR is elevated."],
      },
      hold: { recommended: "release", final: "release", owner: "credit", summary: "Temporary credit release approved after payment commitment." },
      allocation: { recommended: "allocate_full", fill_rate: 1, revenue_at_risk: 0 },
      shipment: { recommended: "scheduled", final: "scheduled", status: "scheduled" },
      billing: { recommended: "ready_to_invoice", final: "ready_to_invoice", status: "ready_to_invoice" },
      invoiceMatching: { recommended: "matched", final: "matched" },
      paymentPrediction: { recommended: "medium", final: "medium" },
      collectionsComms: { recommended: "call", final: "send" },
      invoice_status: "paid",
      dispute: { type: "delivery", status: "resolved", amount: 980, evidence: "POD mismatch corrected and chargeback reversed." },
    },
    {
      index: 3,
      golden_tag: "GOLDEN-ORDER-3",
      customer: makeCustomer("GOLD", 3, {
        customer_id: "CUST-GOLD-003",
        name: "Golden Summit Las Vegas",
        email: "ap-golden-summit@example.com",
        credit_limit: 320000,
        payment_terms_days: 30,
        risk_score: 0.49,
      }),
      order: {
        capture_id: "ORDCAP-GOLD-003",
        profile: "premium",
        storyline: "Inventory split path with staged shipment and resolved quality dispute.",
      },
      credit: { decision: "approve", final: "approve", risk: 44.3, revenue: 4920, badDebt: 738, rationale: ["Approved with standard monitoring."] },
      allocation: { recommended: "split_shipment", fill_rate: 0.78, revenue_at_risk: 3210 },
      shipment: { recommended: "split_required", final: "split_required", status: "split_required" },
      billing: { recommended: "ready_to_invoice", final: "ready_to_invoice", status: "ready_to_invoice" },
      invoiceMatching: { recommended: "matched", final: "matched" },
      paymentPrediction: { recommended: "medium", final: "medium" },
      collectionsComms: { recommended: "email", final: "send" },
      invoice_status: "paid",
      dispute: { type: "quality", status: "resolved", amount: 1860, evidence: "Replacement shipment accepted and dispute closed." },
    },
  ];

  for (const golden of goldenOrders) {
    pushCustomer(golden.customer);
    const createdMinutes = 400 + golden.index * 8;
    const lineItems =
      golden.order.capture_id === "ORDCAP-GOLD-003"
        ? [
            { sku: "HTL-CAL-KING-PREMIUM", quantity: 20, unit_price: SKU_CATALOG["HTL-CAL-KING-PREMIUM"] },
            { sku: "HTL-QUEEN-PREMIUM", quantity: 16, unit_price: SKU_CATALOG["HTL-QUEEN-PREMIUM"] },
          ]
        : buildLineItems(golden.index + 20, golden.order.profile);
    const order = makeOrder("GOLD", golden.index, golden.customer, createdMinutes, {
      capture_id: golden.order.capture_id,
      customer_name: golden.customer.name,
      customer_email: golden.customer.email,
      line_items: lineItems,
      requested_date: day(5 + golden.index),
      ship_to: CITIES[golden.index],
    });
    pushOrder(order);
    pushContractSnapshot(`CTR-SNAP-GOLD-${pad(golden.index)}`, order, golden.customer, iso(createdMinutes + 1), {
      contract_id: `CTR-GOLD-${pad(golden.index)}`,
      source_summary: `${golden.golden_tag}: commercial terms snapshot`,
    });
    pushValidation(`VAL-GOLD-${pad(golden.index)}`, order.capture_id, order, "accept", iso(createdMinutes + 5));
    pushCredit(
      `CRD-GOLD-${pad(golden.index)}`,
      order.capture_id,
      golden.credit.decision,
      golden.credit.final,
      golden.credit.risk,
      golden.credit.revenue,
      golden.credit.badDebt,
      golden.credit.rationale,
      iso(createdMinutes + 10),
    );

    if (golden.hold) {
      pushHold(
        `HLD-GOLD-${pad(golden.index)}`,
        order.capture_id,
        golden.hold.recommended,
        golden.hold.final,
        golden.hold.owner,
        `${golden.golden_tag}: ${golden.hold.summary}`,
        iso(createdMinutes + 14),
      );
    }

    const lineResults =
      golden.order.capture_id === "ORDCAP-GOLD-003"
        ? [
            {
              sku: "HTL-CAL-KING-PREMIUM",
              ordered_qty: 20,
              allocated_qty: 12,
              backordered_qty: 8,
              status: "partial",
              source_location: "Dallas DC",
              substitute_sku: null,
              proposed_ship_date: shiftDate(order.requested_date, 2),
              rationale: "Premium stock staged with inbound replenishment.",
            },
            {
              sku: "HTL-QUEEN-PREMIUM",
              ordered_qty: 16,
              allocated_qty: 16,
              backordered_qty: 0,
              status: "allocated",
              source_location: "Chicago DC",
              substitute_sku: null,
              proposed_ship_date: order.requested_date,
              rationale: "Available inventory released immediately.",
            },
          ]
        : lineResultsFromOrder(order);

    pushInventoryAction(
      `ALC-GOLD-${pad(golden.index)}`,
      order.capture_id,
      golden.allocation.recommended,
      "accepted",
      golden.allocation.fill_rate,
      golden.allocation.revenue_at_risk,
      `${golden.golden_tag}: ${golden.order.storyline}`,
      lineResults,
      iso(createdMinutes + 18),
    );

    pushWorkflowAction(
      `WFA-GOLD-SHP-${pad(golden.index)}`,
      "shipment-planning",
      "order",
      order.capture_id,
      golden.shipment.recommended,
      golden.shipment.final,
      `${golden.golden_tag}: shipment ${golden.shipment.status.replaceAll("_", " ")}`,
      {
        subject_id: order.capture_id,
        capture_id: order.capture_id,
        golden_tag: golden.golden_tag,
        stage_status: "completed",
        created_at: iso(createdMinutes + 22),
        plan_status: golden.shipment.status,
        planned_ship_date: order.requested_date,
        estimated_delivery_date: shiftDate(order.requested_date, 4),
      },
      iso(createdMinutes + 22),
    );

    pushWorkflowAction(
      `WFA-GOLD-BIL-${pad(golden.index)}`,
      "billing-intelligence",
      "order",
      order.capture_id,
      golden.billing.recommended,
      golden.billing.final,
      `${golden.golden_tag}: billing ready on ${order.requested_date}`,
      {
        subject_id: order.capture_id,
        capture_id: order.capture_id,
        golden_tag: golden.golden_tag,
        stage_status: "completed",
        created_at: iso(createdMinutes + 25),
        billing_status: golden.billing.status,
        billing_date: order.requested_date,
        invoice_amount: order.total_amount,
      },
      iso(createdMinutes + 25),
    );

    const invoiceId = `INV-GOLD-${pad(golden.index)}`;
    const paymentId = `PAY-GOLD-${pad(golden.index)}`;
    const collectionId = `COL-GOLD-${pad(golden.index)}`;
    const disputeId = `DSP-GOLD-${pad(golden.index)}`;
    const invoiceDate = shiftDate(order.requested_date, 1);
    const dueDate = shiftDate(invoiceDate, golden.customer.payment_terms_days);

    pushInvoice(invoiceId, golden.customer.customer_id, invoiceDate, dueDate, order.total_amount, 0, golden.invoice_status);
    pushPayment(paymentId, golden.customer.customer_id, shiftDate(invoiceDate, 18), order.total_amount, 0, `WIRE-GOLD-${pad(golden.index)}`, `Applied to ${invoiceId}`);
    pushPaymentAllocation(`ALP-GOLD-${pad(golden.index)}`, paymentId, invoiceId, order.total_amount, 0.99, "Golden journey fully applied.", iso(createdMinutes + 90));
    pushCollection(collectionId, golden.customer.customer_id, invoiceId, "case_follow_up", 0.72 + golden.index * 0.03, `${golden.golden_tag}: follow-up sequence completed.`, "resolved", iso(createdMinutes + 60));
    pushDispute(
      disputeId,
      invoiceId,
      golden.customer.customer_id,
      golden.dispute.type,
      `${golden.golden_tag}: ${golden.order.storyline}`,
      golden.dispute.amount,
      golden.dispute.status,
      golden.dispute.evidence,
      iso(createdMinutes + 70),
      iso(createdMinutes + 120),
    );

    pushWorkflowAction(
      `WFA-GOLD-MAT-${pad(golden.index)}`,
      "invoice-matching",
      "invoice",
      invoiceId,
      golden.invoiceMatching.recommended,
      golden.invoiceMatching.final,
      `${golden.golden_tag}: invoice variance investigated and documented.`,
      {
        subject_id: invoiceId,
        capture_id: order.capture_id,
        invoice_id: invoiceId,
        golden_tag: golden.golden_tag,
        stage_status: "completed",
        created_at: iso(createdMinutes + 32),
        variance_amount: golden.dispute.amount,
        match_status: golden.invoiceMatching.final,
      },
      iso(createdMinutes + 32),
    );

    pushWorkflowAction(
      `WFA-GOLD-PP-${pad(golden.index)}`,
      "payment-prediction",
      "customer",
      golden.customer.customer_id,
      golden.paymentPrediction.recommended,
      golden.paymentPrediction.final,
      `${golden.golden_tag}: predicted payment behavior reviewed.`,
      {
        subject_id: golden.customer.customer_id,
        capture_id: order.capture_id,
        customer_id: golden.customer.customer_id,
        golden_tag: golden.golden_tag,
        stage_status: "completed",
        created_at: iso(createdMinutes + 36),
        late_risk: golden.paymentPrediction.final,
        predicted_payment_date: shiftDate(invoiceDate, 19),
      },
      iso(createdMinutes + 36),
    );

    pushWorkflowAction(
      `WFA-GOLD-COM-${pad(golden.index)}`,
      "collections-communications",
      "collection_action",
      collectionId,
      golden.collectionsComms.recommended,
      golden.collectionsComms.final,
      `${golden.golden_tag}: collections communication sent and closed.`,
      {
        subject_id: collectionId,
        capture_id: order.capture_id,
        collection_action_id: collectionId,
        golden_tag: golden.golden_tag,
        stage_status: "completed",
        created_at: iso(createdMinutes + 64),
        channel: golden.collectionsComms.recommended,
        subject_line: `${golden.golden_tag} follow-up`,
      },
      iso(createdMinutes + 64),
    );

    pushWorkflowAction(
      `WFA-GOLD-ORC-${pad(golden.index)}`,
      "o2c-orchestrator",
      "order",
      order.capture_id,
      "resolved",
      "resolved",
      `${golden.golden_tag}: lifecycle completed through dispute resolution.`,
      {
        subject_id: order.capture_id,
        capture_id: order.capture_id,
        golden_tag: golden.golden_tag,
        stage_status: "resolved",
        created_at: iso(createdMinutes + 125),
        next_agent: null,
        lifecycle_status: "dispute_resolved",
      },
      iso(createdMinutes + 125),
    );

    pushJourney(
      order.capture_id,
      golden.customer.customer_id,
      invoiceId,
      paymentId,
      collectionId,
      disputeId,
      golden.golden_tag,
      golden.order.storyline,
      "dispute_resolved",
      iso(createdMinutes + 125),
    );
  }

  for (let i = 1; i <= QUEUE_SIZE; i += 1) {
    const customer = makeCustomer("VAL", i, { risk_score: Number((0.25 + i * 0.01).toFixed(3)) });
    pushCustomer(customer);
    const order = makeOrder("VAL", i, customer, i);
    pushOrder(order);
    pushContractSnapshot(`CTR-SNAP-VAL-${pad(i)}`, order, customer, iso(i + 1));
  }

  for (let i = 1; i <= QUEUE_SIZE; i += 1) {
    const customer = makeCustomer("CRD", i, { risk_score: Number((0.31 + i * 0.015).toFixed(3)) });
    pushCustomer(customer);
    const order = makeOrder("CRD", i, customer, 40 + i, { profile: i % 3 === 0 ? "hybrid" : "standard" });
    pushOrder(order);
    pushContractSnapshot(`CTR-SNAP-CRD-${pad(i)}`, order, customer, iso(40 + i + 1));
    pushValidation(`VAL-CRD-${pad(i)}`, order.capture_id, order, "accept", iso(40 + i + 5));
  }

  for (let i = 1; i <= QUEUE_SIZE; i += 1) {
    const customer = makeCustomer("HLD", i, { risk_score: Number((0.62 + i * 0.01).toFixed(3)), credit_limit: 90_000 + i * 2_500 });
    pushCustomer(customer);
    const order = makeOrder("HLD", i, customer, 80 + i, { profile: i % 2 === 0 ? "premium" : "hybrid", requires_review: i % 4 === 0 });
    pushOrder(order);
    pushContractSnapshot(`CTR-SNAP-HLD-${pad(i)}`, order, customer, iso(80 + i + 1));
    pushValidation(`VAL-HLD-${pad(i)}`, order.capture_id, order, "accept", iso(80 + i + 5));
    pushCredit(
      `CRD-HLD-${pad(i)}`,
      order.capture_id,
      "hold",
      "hold",
      78 + i * 0.6,
      Number((order.total_amount * 0.42).toFixed(2)),
      Number((order.total_amount * 0.08).toFixed(2)),
      [
        `Projected utilization exceeds policy for HLD queue item ${pad(i)}.`,
        "Open dispute balance and recent late payment behavior require manual release.",
      ],
      iso(80 + i + 10),
    );
  }

  for (let i = 1; i <= QUEUE_SIZE; i += 1) {
    const customer = makeCustomer("ALC", i, { risk_score: Number((0.35 + i * 0.012).toFixed(3)) });
    pushCustomer(customer);
    const order = makeOrder("ALC", i, customer, 120 + i, {
      profile: i % 5 === 0 ? "premium" : i % 2 === 0 ? "hybrid" : "standard",
    });
    pushOrder(order);
    pushContractSnapshot(`CTR-SNAP-ALC-${pad(i)}`, order, customer, iso(120 + i + 1));
    pushValidation(`VAL-ALC-${pad(i)}`, order.capture_id, order, "accept", iso(120 + i + 5));
    pushCredit(
      `CRD-ALC-${pad(i)}`,
      order.capture_id,
      i % 6 === 0 ? "conditional" : "approve",
      i % 6 === 0 ? "conditional" : "approve",
      34 + i * 0.7,
      Number((order.total_amount * 0.16).toFixed(2)),
      Number((order.total_amount * 0.03).toFixed(2)),
      ["Commercial risk approved for allocation."],
      iso(120 + i + 10),
    );
  }

  for (let i = 1; i <= QUEUE_SIZE; i += 1) {
    const customer = makeCustomer("SHP", i, { risk_score: Number((0.29 + i * 0.011).toFixed(3)) });
    pushCustomer(customer);
    const order = makeOrder("SHP", i, customer, 160 + i, { profile: i % 3 === 0 ? "hybrid" : "standard" });
    pushOrder(order);
    pushContractSnapshot(`CTR-SNAP-SHP-${pad(i)}`, order, customer, iso(160 + i + 1));
    pushValidation(`VAL-SHP-${pad(i)}`, order.capture_id, order, "accept", iso(160 + i + 5));
    pushCredit(
      `CRD-SHP-${pad(i)}`,
      order.capture_id,
      "approve",
      "approve",
      26 + i * 0.5,
      Number((order.total_amount * 0.12).toFixed(2)),
      Number((order.total_amount * 0.02).toFixed(2)),
      ["Ready for inventory commitment."],
      iso(160 + i + 10),
    );
    pushInventoryAction(
      `ALC-SHP-${pad(i)}`,
      order.capture_id,
      i % 4 === 0 ? "split_shipment" : "allocate_full",
      "accepted",
      i % 4 === 0 ? 0.88 : 1,
      i % 4 === 0 ? Number((order.total_amount * 0.11).toFixed(2)) : 0,
      `Shipment queue item ${pad(i)} prepared for shipment planning.`,
      lineResultsFromOrder(order, i % 4 === 0 ? { partial: 3 } : {}),
      iso(160 + i + 15),
    );
  }

  for (let i = 1; i <= QUEUE_SIZE; i += 1) {
    const customer = makeCustomer("BIL", i, { risk_score: Number((0.27 + i * 0.013).toFixed(3)) });
    pushCustomer(customer);
    const order = makeOrder("BIL", i, customer, 200 + i, { profile: i % 3 === 1 ? "hybrid" : "standard" });
    pushOrder(order);
    pushContractSnapshot(`CTR-SNAP-BIL-${pad(i)}`, order, customer, iso(200 + i + 1));
    pushValidation(`VAL-BIL-${pad(i)}`, order.capture_id, order, "accept", iso(200 + i + 5));
    pushCredit(
      `CRD-BIL-${pad(i)}`,
      order.capture_id,
      "approve",
      "approve",
      24 + i * 0.4,
      Number((order.total_amount * 0.14).toFixed(2)),
      Number((order.total_amount * 0.02).toFixed(2)),
      ["Released for shipment execution."],
      iso(200 + i + 10),
    );
    const lineResults = lineResultsFromOrder(order);
    pushInventoryAction(
      `ALC-BIL-${pad(i)}`,
      order.capture_id,
      "allocate_full",
      "accepted",
      1,
      0,
      `Billing queue item ${pad(i)} allocated in full.`,
      lineResults,
      iso(200 + i + 15),
    );
    pushWorkflowAction(
      `WFA-BIL-SHP-${pad(i)}`,
      "shipment-planning",
      "order",
      order.capture_id,
      i % 5 === 0 ? "manual_review" : i % 4 === 0 ? "capacity_risk" : "scheduled",
      i % 5 === 0 ? "manual_review" : i % 4 === 0 ? "capacity_risk" : "scheduled",
      `Billing queue item ${pad(i)} shipped and awaiting billing review.`,
      {
        subject_id: order.capture_id,
        capture_id: order.capture_id,
        stage_status: "completed",
        created_at: iso(200 + i + 22),
        plan_status: i % 5 === 0 ? "manual_review" : i % 4 === 0 ? "capacity_risk" : "scheduled",
        planned_ship_date: order.requested_date,
        estimated_delivery_date: shiftDate(order.requested_date, 4),
      },
      iso(200 + i + 22),
    );
  }

  for (let i = 1; i <= QUEUE_SIZE; i += 1) {
    const queueOffset = -180 + i;
    const customer = makeCustomer("DSN", i, {
      risk_score: Number((0.55 + i * 0.015).toFixed(3)),
      payment_terms_days: 30 + (i % 3) * 15,
      credit_limit: 110_000 + i * 3_000,
    });
    pushCustomer(customer);
    const order = makeOrder("DSN", i, customer, queueOffset, { profile: i % 4 === 0 ? "premium" : "hybrid" });
    pushOrder(order);
    pushContractSnapshot(`CTR-SNAP-DSN-${pad(i)}`, order, customer, iso(queueOffset + 1));
    pushValidation(`VAL-DSN-${pad(i)}`, order.capture_id, order, "accept", iso(queueOffset + 5));
    pushCredit(
      `CRD-DSN-${pad(i)}`,
      order.capture_id,
      i % 6 === 0 ? "conditional" : "approve",
      i % 6 === 0 ? "conditional" : "approve",
      38 + i * 0.7,
      Number((order.total_amount * 0.19).toFixed(2)),
      Number((order.total_amount * 0.04).toFixed(2)),
      ["Order progressed through commercial controls."],
      iso(queueOffset + 10),
    );
    pushInventoryAction(
      `ALC-DSN-${pad(i)}`,
      order.capture_id,
      i % 5 === 0 ? "split_shipment" : "allocate_full",
      "accepted",
      i % 5 === 0 ? 0.91 : 1,
      i % 5 === 0 ? Number((order.total_amount * 0.09).toFixed(2)) : 0,
      `Downstream queue item ${pad(i)} inventory committed.`,
      lineResultsFromOrder(order, i % 5 === 0 ? { partial: 2 } : {}),
      iso(queueOffset + 15),
    );
    pushWorkflowAction(
      `WFA-DSN-SHP-${pad(i)}`,
      "shipment-planning",
      "order",
      order.capture_id,
      i % 5 === 0 ? "split_required" : "scheduled",
      i % 5 === 0 ? "split_required" : "scheduled",
      `Downstream queue item ${pad(i)} shipped to customer.`,
      {
        subject_id: order.capture_id,
        capture_id: order.capture_id,
        stage_status: "completed",
        created_at: iso(queueOffset + 20),
        plan_status: i % 5 === 0 ? "split_required" : "scheduled",
        planned_ship_date: order.requested_date,
        estimated_delivery_date: shiftDate(order.requested_date, 4),
      },
      iso(queueOffset + 20),
    );
    pushWorkflowAction(
      `WFA-DSN-BIL-${pad(i)}`,
      "billing-intelligence",
      "order",
      order.capture_id,
      "ready_to_invoice",
      "ready_to_invoice",
      `Downstream queue item ${pad(i)} invoiced with open balance.`,
      {
        subject_id: order.capture_id,
        capture_id: order.capture_id,
        stage_status: "completed",
        created_at: iso(queueOffset + 24),
        billing_status: "ready_to_invoice",
        billing_date: shiftDate(order.requested_date, 1),
        invoice_amount: order.total_amount,
      },
      iso(queueOffset + 24),
    );

    const invoiceId = `INV-DSN-${pad(i)}`;
    const paymentId = `PAY-DSN-${pad(i)}`;
    const collectionId = `COL-DSN-${pad(i)}`;
    const disputeId = `DSP-DSN-${pad(i)}`;
    const invoiceDate = shiftDate(order.requested_date, 1);
    const dueDate = shiftDate(invoiceDate, customer.payment_terms_days);
    const disputeAmount = Number((order.total_amount * (0.1 + (i % 4) * 0.03)).toFixed(2));
    const varianceMultiplier = i % 5 === 0 ? 1.08 : i % 5 === 3 ? 0.94 : 1;
    const billedTotal = Number((order.total_amount * varianceMultiplier).toFixed(2));

    const patternCase = i % 4;
    if (patternCase === 2 || patternCase === 0) {
      const primaryInvoiceAmount = Number((billedTotal * 0.58).toFixed(2));
      const secondaryInvoiceAmount = Number((billedTotal - primaryInvoiceAmount).toFixed(2));
      pushInvoice(invoiceId, customer.customer_id, invoiceDate, dueDate, primaryInvoiceAmount, primaryInvoiceAmount, "open");
      pushInvoice(`INV-DSN-${pad(i)}-B`, customer.customer_id, shiftDate(invoiceDate, 3), shiftDate(dueDate, 3), secondaryInvoiceAmount, secondaryInvoiceAmount, "open");
    } else {
      pushInvoice(invoiceId, customer.customer_id, invoiceDate, dueDate, billedTotal, billedTotal, "open");
    }

    if (patternCase === 1) {
      const paymentAmount = Number((billedTotal * 0.42).toFixed(2));
      pushPayment(paymentId, customer.customer_id, shiftDate(invoiceDate, 14 + (i % 6)), paymentAmount, paymentAmount, `LOCKBOX-${pad(i, 5)}`, `Customer referenced ${invoiceId} in remittance note.`);
    } else if (patternCase === 2) {
      const paymentAmount = Number((billedTotal * 0.72).toFixed(2));
      pushPayment(
        paymentId,
        customer.customer_id,
        shiftDate(invoiceDate, 16 + (i % 4)),
        paymentAmount,
        paymentAmount,
        `WIRE-${pad(i, 5)}`,
        `Customer remittance covers invoice ${invoiceId} and additional open balances.`,
      );
    } else if (patternCase === 3) {
      const paymentAmountA = Number((billedTotal * 0.36).toFixed(2));
      const paymentAmountB = Number((billedTotal * 0.29).toFixed(2));
      pushPayment(paymentId, customer.customer_id, shiftDate(invoiceDate, 12 + (i % 5)), paymentAmountA, paymentAmountA, `ACH-${pad(i, 5)}`, `Partial payment for ${invoiceId}.`);
      pushPayment(`PAY-DSN-${pad(i)}-B`, customer.customer_id, shiftDate(invoiceDate, 22 + (i % 5)), paymentAmountB, paymentAmountB, `ACH2-${pad(i, 5)}`, "Second installment, no invoice references supplied.");
    } else {
      const paymentAmountA = Number((billedTotal * 0.33).toFixed(2));
      const paymentAmountB = Number((billedTotal * 0.31).toFixed(2));
      pushPayment(paymentId, customer.customer_id, shiftDate(invoiceDate, 10 + (i % 4)), paymentAmountA, paymentAmountA, `WIREA-${pad(i, 5)}`, `Payment references ${invoiceId}.`);
      pushPayment(`PAY-DSN-${pad(i)}-B`, customer.customer_id, shiftDate(invoiceDate, 18 + (i % 4)), paymentAmountB, paymentAmountB, `WIREB-${pad(i, 5)}`, `Apply to ${invoiceId} and INV-DSN-${pad(i)}-B if needed.`);
    }

    pushCollection(
      collectionId,
      customer.customer_id,
      invoiceId,
      i % 3 === 0 ? "call_customer" : i % 3 === 1 ? "email_reminder" : "portal_reminder",
      Number((0.74 + i * 0.01).toFixed(2)),
      `Follow up on ${invoiceId} for downstream queue item ${pad(i)}.`,
      "open",
      iso(queueOffset + 45),
    );
    pushDispute(
      disputeId,
      invoiceId,
      customer.customer_id,
      ["pricing", "delivery", "quality", "short_ship"][i % 4],
      `Downstream queue item ${pad(i)} requires dispute triage.`,
      disputeAmount,
      "open",
      i % 2 === 0 ? "Customer provided partial backup only." : "",
      iso(queueOffset + 50),
      null,
    );
    pushJourney(
      order.capture_id,
      customer.customer_id,
      invoiceId,
      paymentId,
      collectionId,
      disputeId,
      null,
      `Downstream queue item ${pad(i)} seeded for invoice, payment, collections, cash application, and dispute workloads.`,
      "dispute_open",
      null,
    );
  }

  const orchestratorQueueSamples = [
    { capture_id: "ORDCAP-HLD-001", next_agent: "hold-resolution", priority: "high" },
    { capture_id: "ORDCAP-ALC-001", next_agent: "inventory-allocation", priority: "medium" },
    { capture_id: "ORDCAP-DSN-001", next_agent: "invoice-matching", priority: "medium" },
  ];

  for (let i = 0; i < orchestratorQueueSamples.length; i += 1) {
    const sample = orchestratorQueueSamples[i];
    pushWorkflowAction(
      `WFA-ORC-Q-${pad(i + 1)}`,
      "o2c-orchestrator",
      "order",
      sample.capture_id,
      sample.next_agent,
      sample.next_agent,
      `Queued for ${sample.next_agent}.`,
      {
        subject_id: sample.capture_id,
        capture_id: sample.capture_id,
        stage_status: "actionable",
        created_at: iso(520 + i),
        next_agent: sample.next_agent,
        priority: sample.priority,
      },
      iso(520 + i),
    );
  }

  pushInsight(
    "INS-WCI-001",
    "working-capital-intelligence",
    "cash_conversion",
    "portfolio",
    "medium",
    "Cash Conversion Drag",
    "Twenty downstream orders are intentionally left open across invoice, collections, and dispute steps to demonstrate working-capital pressure.",
    {
      subject_id: "portfolio",
      stage_status: "seeded",
      open_invoice_count: QUEUE_SIZE,
      open_dispute_count: QUEUE_SIZE,
      recommendation: "Use the seeded queues to demo collections prioritization and dispute aging.",
    },
    iso(600),
  );

  pushInsight(
    "INS-PM-001",
    "process-mining",
    "bottleneck",
    "order-to-cash",
    "medium",
    "Midstream Queue Concentration",
    "Shipment, billing, invoice matching, and collections queues are all populated with at least twenty actionable records.",
    {
      subject_id: "order-to-cash",
      stage_status: "seeded",
      shipment_queue: QUEUE_SIZE,
      billing_queue: QUEUE_SIZE,
      invoice_matching_queue: QUEUE_SIZE,
      collections_queue: QUEUE_SIZE,
    },
    iso(601),
  );

  pushInsight(
    "INS-CMP-001",
    "compliance-audit",
    "audit_trace",
    "golden-journeys",
    "low",
    "Golden Journey Traceability",
    "Three canonical orders now carry explicit capture, invoice, payment, collection, and dispute linkage for audit walkthroughs.",
    {
      subject_id: "golden-journeys",
      stage_status: "seeded",
      journey_count: 3,
      tags: ["GOLDEN-ORDER-1", "GOLDEN-ORDER-2", "GOLDEN-ORDER-3"],
    },
    iso(602),
  );

  return rows;
}

async function main() {
  const rows = buildRows();
  const inserts = [
    ["customers", rows.customers],
    ["contract_snapshots", rows.contractSnapshots],
    ["order_capture_orders", rows.orders],
    ["order_validation_actions", rows.validations],
    ["credit_risk_actions", rows.credits],
    ["hold_resolution_actions", rows.holds],
    ["inventory_positions", rows.inventoryPositions],
    ["inventory_allocation_actions", rows.allocations],
    ["workflow_agent_actions", rows.workflowActions],
    ["invoices", rows.invoices],
    ["payments", rows.payments],
    ["allocations", rows.paymentAllocations],
    ["collections_actions", rows.collections],
    ["disputes", rows.disputes],
    ["order_journey_trace", rows.journeys],
    ["agent_insights", rows.insights],
  ];

  for (const [table, values] of inserts) {
    console.log(`Seeding ${table} (${values.length})...`);
    await insertValues(table, values);
  }

  console.log(
    `Seed complete. customers=${rows.customers.length} orders=${rows.orders.length} invoices=${rows.invoices.length} payments=${rows.payments.length} disputes=${rows.disputes.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { randomUUID } from "node:crypto";
import { dbAll, dbExec, dbGet, dbRun, escapeSqlString } from "@/lib/db/duckdb";
import type {
  Allocation,
  AllocationEligibleOrder,
  AgentInsight,
  CapturedOrder,
  CashApplicationQueueCustomer,
  CollectionsStrategyQueueRow,
  InventoryPosition,
  CreditRatedOrder,
  CreditRiskAction,
  CollectionAction,
  ContractSnapshot,
  Customer,
  Dispute,
  HeldOrder,
  Invoice,
  Kpis,
  OrderJourneyTrace,
  OrderValidationAction,
  OrderCaptureKpis,
  OrderLineItem,
  OrderCaptureSource,
  Payment,
  ValidatedOrder,
  WorkflowAgentAction,
} from "@/lib/types";

let orderCaptureTableReady = false;
let orderValidationActionsTableReady = false;
let creditRiskActionsTableReady = false;
let holdResolutionActionsTableReady = false;
let inventoryPositionsTableReady = false;
let inventoryAllocationActionsTableReady = false;
let workflowAgentActionsTableReady = false;
let agentInsightsTableReady = false;
let orderJourneyTraceTableReady = false;
let contractSnapshotsTableReady = false;

async function ensureOrderCaptureTable() {
  if (orderCaptureTableReady) {
    return;
  }

  await dbExec(`
    CREATE TABLE IF NOT EXISTS order_capture_orders (
      capture_id TEXT PRIMARY KEY,
      source TEXT,
      customer_name TEXT,
      customer_email TEXT,
      po_number TEXT,
      requested_date DATE,
      ship_to TEXT,
      currency TEXT,
      total_amount DOUBLE,
      line_items_json TEXT,
      extraction_confidence DOUBLE,
      requires_review BOOLEAN,
      processing_seconds DOUBLE,
      created_by TEXT,
      created_at TIMESTAMP
    );
  `);

  orderCaptureTableReady = true;
}

async function ensureOrderValidationActionsTable() {
  if (orderValidationActionsTableReady) {
    return;
  }

  await dbExec(`
    CREATE TABLE IF NOT EXISTS order_validation_actions (
      action_id TEXT PRIMARY KEY,
      capture_id TEXT,
      action TEXT,
      original_json TEXT,
      proposed_json TEXT,
      discrepancies_json TEXT,
      actor TEXT,
      created_at TIMESTAMP
    );
  `);

  orderValidationActionsTableReady = true;
}

async function ensureCreditRiskActionsTable() {
  if (creditRiskActionsTableReady) {
    return;
  }

  await dbExec(`
    CREATE TABLE IF NOT EXISTS credit_risk_actions (
      action_id TEXT PRIMARY KEY,
      capture_id TEXT,
      recommended_decision TEXT,
      final_decision TEXT,
      risk_score DOUBLE,
      revenue_at_risk DOUBLE,
      bad_debt_delta DOUBLE,
      rationale_json TEXT,
      override_reason TEXT,
      actor TEXT,
      created_at TIMESTAMP
    );
  `);

  creditRiskActionsTableReady = true;
}

async function ensureHoldResolutionActionsTable() {
  if (holdResolutionActionsTableReady) {
    return;
  }

  await dbExec(`
    CREATE TABLE IF NOT EXISTS hold_resolution_actions (
      action_id TEXT PRIMARY KEY,
      capture_id TEXT,
      recommended_decision TEXT,
      final_decision TEXT,
      owner_team TEXT,
      resolution_summary TEXT,
      actor TEXT,
      created_at TIMESTAMP
    );
  `);

  holdResolutionActionsTableReady = true;
}

async function ensureInventoryPositionsTable() {
  if (inventoryPositionsTableReady) {
    return;
  }

  await dbExec(`
    CREATE TABLE IF NOT EXISTS inventory_positions (
      inventory_id TEXT PRIMARY KEY,
      sku TEXT,
      location TEXT,
      on_hand_qty DOUBLE,
      reserved_qty DOUBLE,
      available_qty DOUBLE,
      inbound_qty DOUBLE,
      next_inbound_date DATE,
      updated_at TIMESTAMP
    );
  `);

  inventoryPositionsTableReady = true;
}

async function ensureInventoryAllocationActionsTable() {
  if (inventoryAllocationActionsTableReady) {
    return;
  }

  await dbExec(`
    CREATE TABLE IF NOT EXISTS inventory_allocation_actions (
      action_id TEXT PRIMARY KEY,
      capture_id TEXT,
      recommended_decision TEXT,
      final_decision TEXT,
      fill_rate DOUBLE,
      revenue_at_risk DOUBLE,
      summary TEXT,
      line_results_json TEXT,
      actor TEXT,
      created_at TIMESTAMP
    );
  `);

  inventoryAllocationActionsTableReady = true;
}

async function ensureWorkflowAgentActionsTable() {
  if (workflowAgentActionsTableReady) {
    return;
  }

  await dbExec(`
    CREATE TABLE IF NOT EXISTS workflow_agent_actions (
      action_id TEXT PRIMARY KEY,
      agent_id TEXT,
      subject_type TEXT,
      subject_id TEXT,
      recommended_decision TEXT,
      final_decision TEXT,
      summary TEXT,
      payload_json TEXT,
      actor TEXT,
      created_at TIMESTAMP
    );
  `);

  workflowAgentActionsTableReady = true;
}

async function ensureAgentInsightsTable() {
  if (agentInsightsTableReady) {
    return;
  }

  await dbExec(`
    CREATE TABLE IF NOT EXISTS agent_insights (
      insight_id TEXT PRIMARY KEY,
      agent_id TEXT,
      insight_type TEXT,
      subject_id TEXT,
      severity TEXT,
      title TEXT,
      summary TEXT,
      payload_json TEXT,
      actor TEXT,
      created_at TIMESTAMP
    );
  `);

  agentInsightsTableReady = true;
}

async function ensureOrderJourneyTraceTable() {
  if (orderJourneyTraceTableReady) {
    return;
  }

  await dbExec(`
    CREATE TABLE IF NOT EXISTS order_journey_trace (
      capture_id TEXT PRIMARY KEY,
      customer_id TEXT,
      invoice_id TEXT,
      payment_id TEXT,
      collection_action_id TEXT,
      dispute_id TEXT,
      golden_tag TEXT,
      storyline TEXT,
      lifecycle_status TEXT,
      resolved_at TIMESTAMP
    );
  `);

  orderJourneyTraceTableReady = true;
}

async function ensureContractSnapshotsTable() {
  if (contractSnapshotsTableReady) {
    return;
  }

  await dbExec(`
    CREATE TABLE IF NOT EXISTS contract_snapshots (
      contract_snapshot_id TEXT PRIMARY KEY,
      capture_id TEXT,
      customer_id TEXT,
      contract_id TEXT,
      effective_date DATE,
      expiration_date DATE,
      payment_terms_days INTEGER,
      currency TEXT,
      total_amount DOUBLE,
      line_items_json TEXT,
      commercial_terms_json TEXT,
      source_summary TEXT,
      created_at TIMESTAMP
    );
  `);

  contractSnapshotsTableReady = true;
}

export async function listCustomers(limit = 200): Promise<Customer[]> {
  return dbAll<Customer>(`SELECT * FROM customers ORDER BY created_at DESC LIMIT ${limit}`);
}

export async function listOrderJourneyTrace(limit = 50): Promise<OrderJourneyTrace[]> {
  await ensureOrderJourneyTraceTable();
  return dbAll<OrderJourneyTrace>(`
    SELECT *
    FROM order_journey_trace
    ORDER BY golden_tag ASC NULLS LAST, capture_id ASC
    LIMIT ${limit}
  `);
}

export async function getOrderJourneyTrace(captureId: string): Promise<OrderJourneyTrace | null> {
  await ensureOrderJourneyTraceTable();
  return dbGet<OrderJourneyTrace>(`
    SELECT *
    FROM order_journey_trace
    WHERE capture_id = '${escapeSqlString(captureId)}'
  `);
}

export async function getCustomer(customerId: string): Promise<Customer | null> {
  return dbGet<Customer>(`SELECT * FROM customers WHERE customer_id = '${escapeSqlString(customerId)}'`);
}

export async function getCapturedOrder(captureId: string): Promise<CapturedOrder | null> {
  await ensureOrderCaptureTable();
  return dbGet<CapturedOrder>(`
    SELECT *
    FROM order_capture_orders
    WHERE capture_id = '${escapeSqlString(captureId)}'
  `);
}

export async function getContractSnapshotByCapture(captureId: string): Promise<ContractSnapshot | null> {
  await ensureContractSnapshotsTable();
  return dbGet<ContractSnapshot>(`
    SELECT *
    FROM contract_snapshots
    WHERE capture_id = '${escapeSqlString(captureId)}'
    ORDER BY created_at DESC, contract_snapshot_id DESC
    LIMIT 1
  `);
}

export async function listInvoices(limit = 300): Promise<Invoice[]> {
  await ensureOrderJourneyTraceTable();
  return dbAll<Invoice>(`
    SELECT i.*, t.capture_id, t.golden_tag
    FROM invoices i
    LEFT JOIN order_journey_trace t ON t.invoice_id = i.invoice_id
    ORDER BY i.due_date ASC
    LIMIT ${limit}
  `);
}

export async function listOpenInvoicesByCustomer(customerId: string, limit = 100): Promise<Invoice[]> {
  await ensureOrderJourneyTraceTable();
  return dbAll<Invoice>(`
    WITH allocation_totals AS (
      SELECT invoice_id, COALESCE(SUM(allocated_amount), 0) AS allocated_total
      FROM allocations
      GROUP BY invoice_id
    )
    SELECT
      i.invoice_id,
      i.customer_id,
      i.invoice_date,
      i.due_date,
      i.amount_total,
      GREATEST(i.amount_total - COALESCE(a.allocated_total, 0), 0) AS amount_open,
      CASE
        WHEN i.amount_total - COALESCE(a.allocated_total, 0) <= 0 THEN 'paid'
        ELSE 'open'
      END AS status,
      t.capture_id,
      t.golden_tag
    FROM invoices i
    LEFT JOIN allocation_totals a ON a.invoice_id = i.invoice_id
    LEFT JOIN order_journey_trace t ON t.invoice_id = i.invoice_id
    WHERE i.customer_id = '${escapeSqlString(customerId)}'
      AND GREATEST(i.amount_total - COALESCE(a.allocated_total, 0), 0) > 0
    ORDER BY i.due_date ASC
    LIMIT ${limit}
  `);
}

export async function getInvoice(invoiceId: string): Promise<Invoice | null> {
  await ensureOrderJourneyTraceTable();
  return dbGet<Invoice>(`
    SELECT i.*, t.capture_id, t.golden_tag
    FROM invoices i
    LEFT JOIN order_journey_trace t ON t.invoice_id = i.invoice_id
    WHERE i.invoice_id = '${escapeSqlString(invoiceId)}'
  `);
}

export async function listPayments(limit = 300): Promise<Payment[]> {
  await ensureOrderJourneyTraceTable();
  return dbAll<Payment>(`
    SELECT p.*, t.capture_id, t.golden_tag
    FROM payments p
    LEFT JOIN order_journey_trace t ON t.payment_id = p.payment_id
    ORDER BY p.payment_date DESC
    LIMIT ${limit}
  `);
}

export async function listUnappliedPaymentsByCustomer(customerId: string, limit = 100): Promise<Payment[]> {
  await ensureOrderJourneyTraceTable();
  return dbAll<Payment>(`
    WITH allocation_totals AS (
      SELECT payment_id, COALESCE(SUM(allocated_amount), 0) AS allocated_total
      FROM allocations
      GROUP BY payment_id
    )
    SELECT
      p.payment_id,
      p.customer_id,
      p.payment_date,
      p.amount_total,
      GREATEST(p.amount_total - COALESCE(a.allocated_total, 0), 0) AS amount_unapplied,
      p.payment_ref,
      p.remittance_text,
      t.capture_id,
      t.golden_tag
    FROM payments p
    LEFT JOIN allocation_totals a ON a.payment_id = p.payment_id
    LEFT JOIN order_journey_trace t ON t.payment_id = p.payment_id
    WHERE p.customer_id = '${escapeSqlString(customerId)}'
      AND GREATEST(p.amount_total - COALESCE(a.allocated_total, 0), 0) > 0
    ORDER BY p.payment_date DESC, p.payment_id DESC
    LIMIT ${limit}
  `);
}

export async function getPayment(paymentId: string): Promise<Payment | null> {
  await ensureOrderJourneyTraceTable();
  return dbGet<Payment>(`
    SELECT p.*, t.capture_id, t.golden_tag
    FROM payments p
    LEFT JOIN order_journey_trace t ON t.payment_id = p.payment_id
    WHERE p.payment_id = '${escapeSqlString(paymentId)}'
  `);
}

export async function createPayment(input: {
  customer_id: string;
  payment_date: string;
  amount_total: number;
  payment_ref: string;
  remittance_text: string;
}): Promise<Payment> {
  const paymentId = `PAY-${randomUUID().slice(0, 8)}`;
  const escapedRef = escapeSqlString(input.payment_ref);
  const escapedRem = escapeSqlString(input.remittance_text);

  await dbRun(`
    INSERT INTO payments VALUES (
      '${paymentId}',
      '${escapeSqlString(input.customer_id)}',
      '${input.payment_date}',
      ${input.amount_total},
      ${input.amount_total},
      '${escapedRef}',
      '${escapedRem}'
    )
  `);

  await logEvent("payments", paymentId, "payment.created", "api", input);

  const payment = await getPayment(paymentId);
  if (!payment) {
    throw new Error("Failed to create payment");
  }
  return payment;
}

export async function listDisputes(limit = 300): Promise<Dispute[]> {
  await ensureOrderJourneyTraceTable();
  return dbAll<Dispute>(`
    SELECT d.*, t.capture_id, t.golden_tag
    FROM disputes d
    LEFT JOIN order_journey_trace t ON t.dispute_id = d.dispute_id
    ORDER BY d.created_at DESC
    LIMIT ${limit}
  `);
}

export async function getDispute(disputeId: string): Promise<Dispute | null> {
  await ensureOrderJourneyTraceTable();
  return dbGet<Dispute>(`
    SELECT d.*, t.capture_id, t.golden_tag
    FROM disputes d
    LEFT JOIN order_journey_trace t ON t.dispute_id = d.dispute_id
    WHERE d.dispute_id = '${escapeSqlString(disputeId)}'
  `);
}

export async function listDisputesByInvoice(invoiceId: string): Promise<Dispute[]> {
  await ensureOrderJourneyTraceTable();
  return dbAll<Dispute>(`
    SELECT d.*, t.capture_id, t.golden_tag
    FROM disputes d
    LEFT JOIN order_journey_trace t ON t.dispute_id = d.dispute_id
    WHERE d.invoice_id = '${escapeSqlString(invoiceId)}'
    ORDER BY d.created_at DESC
  `);
}

export async function createDispute(input: {
  invoice_id: string;
  customer_id: string;
  description: string;
  amount_at_risk: number;
}): Promise<Dispute> {
  const disputeId = `DSP-${randomUUID().slice(0, 8)}`;
  await dbRun(`
    INSERT INTO disputes VALUES (
      '${disputeId}',
      '${escapeSqlString(input.invoice_id)}',
      '${escapeSqlString(input.customer_id)}',
      'unclassified',
      '${escapeSqlString(input.description)}',
      ${input.amount_at_risk},
      'open',
      '',
      now(),
      NULL
    )
  `);

  await logEvent("disputes", disputeId, "dispute.created", "api", input);

  const dispute = await getDispute(disputeId);
  if (!dispute) {
    throw new Error("Failed to create dispute");
  }
  return dispute;
}

export async function createAllocations(input: {
  payment_id: string;
  allocations: Array<{ invoice_id: string; allocated_amount: number; confidence: number; rationale: string }>;
  created_by: string;
}): Promise<Allocation[]> {
  const payment = await getPayment(input.payment_id);
  if (!payment) {
    throw new Error(`Payment not found: ${input.payment_id}`);
  }

  let remaining = Number(payment.amount_unapplied);
  const created: Allocation[] = [];

  for (const suggestion of input.allocations) {
    if (suggestion.confidence < 0.92) {
      continue;
    }

    const invoice = await getInvoice(suggestion.invoice_id);
    if (!invoice) {
      continue;
    }

    const open = Number(invoice.amount_open);
    const amount = Math.min(Math.max(0, suggestion.allocated_amount), open, remaining);

    if (amount <= 0) {
      continue;
    }

    const allocationId = `ALC-${randomUUID().slice(0, 8)}`;

    await dbRun(`
      INSERT INTO allocations VALUES (
        '${allocationId}',
        '${escapeSqlString(input.payment_id)}',
        '${escapeSqlString(invoice.invoice_id)}',
        ${amount},
        ${Math.min(0.99, suggestion.confidence)},
        '${escapeSqlString(suggestion.rationale)}',
        '${escapeSqlString(input.created_by)}',
        now()
      )
    `);

    await dbRun(`
      UPDATE invoices
      SET amount_open = GREATEST(amount_open - ${amount}, 0),
          status = CASE WHEN amount_open - ${amount} <= 0 THEN 'paid' ELSE 'open' END
      WHERE invoice_id = '${escapeSqlString(invoice.invoice_id)}'
    `);

    remaining = Number((remaining - amount).toFixed(2));
    await dbRun(`
      UPDATE payments
      SET amount_unapplied = ${Math.max(remaining, 0)}
      WHERE payment_id = '${escapeSqlString(input.payment_id)}'
    `);

    created.push({
      allocation_id: allocationId,
      payment_id: input.payment_id,
      invoice_id: invoice.invoice_id,
      allocated_amount: amount,
      confidence: Math.min(0.99, suggestion.confidence),
      rationale: suggestion.rationale,
      created_by: input.created_by,
      created_at: new Date().toISOString(),
    });
  }

  await logEvent("payments", input.payment_id, "allocation.created", input.created_by, { allocations: created.length });

  return created;
}

export async function updateDispute(disputeId: string, input: { dispute_type: string; evidence_summary: string; status?: string }) {
  await dbRun(`
    UPDATE disputes
    SET dispute_type = '${escapeSqlString(input.dispute_type)}',
        evidence_summary = '${escapeSqlString(input.evidence_summary)}',
        status = '${escapeSqlString(input.status ?? "in_review")}'
    WHERE dispute_id = '${escapeSqlString(disputeId)}'
  `);

  await logEvent("disputes", disputeId, "dispute.updated", "dispute-agent", input);

  return getDispute(disputeId);
}

export async function listCollectionsActions(limit = 300): Promise<CollectionAction[]> {
  await ensureOrderJourneyTraceTable();
  return dbAll<CollectionAction>(`
    SELECT c.*, t.capture_id, t.golden_tag
    FROM collections_actions c
    LEFT JOIN order_journey_trace t ON t.collection_action_id = c.action_id
    ORDER BY c.priority_score DESC
    LIMIT ${limit}
  `);
}

export async function listCollectionsStrategyQueue(limit = 100): Promise<CollectionsStrategyQueueRow[]> {
  await ensureOrderJourneyTraceTable();
  return dbAll<CollectionsStrategyQueueRow>(`
    WITH latest_collection AS (
      SELECT *
      FROM (
        SELECT
          invoice_id,
          action_type,
          status,
          created_at,
          ROW_NUMBER() OVER (PARTITION BY invoice_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM collections_actions
      )
      WHERE rn = 1
    )
    SELECT
      i.invoice_id,
      t.capture_id,
      i.customer_id,
      c.name AS customer_name,
      i.due_date,
      i.amount_total,
      i.amount_open,
      GREATEST(date_diff('day', i.due_date, CURRENT_DATE), 0) AS days_past_due,
      c.risk_score,
      t.golden_tag
    FROM invoices i
    INNER JOIN customers c ON c.customer_id = i.customer_id
    LEFT JOIN order_journey_trace t ON t.invoice_id = i.invoice_id
    LEFT JOIN latest_collection lc ON lc.invoice_id = i.invoice_id
    WHERE i.amount_open > 0
      AND COALESCE(lc.status, 'open') <> 'resolved'
    ORDER BY days_past_due DESC, c.risk_score DESC, i.amount_open DESC
    LIMIT ${limit}
  `);
}

export async function getCollectionAction(actionId: string): Promise<CollectionAction | null> {
  await ensureOrderJourneyTraceTable();
  return dbGet<CollectionAction>(`
    SELECT c.*, t.capture_id, t.golden_tag
    FROM collections_actions c
    LEFT JOIN order_journey_trace t ON t.collection_action_id = c.action_id
    WHERE c.action_id = '${escapeSqlString(actionId)}'
  `);
}

export async function getLatestCollectionActionByInvoice(invoiceId: string): Promise<CollectionAction | null> {
  await ensureOrderJourneyTraceTable();
  return dbGet<CollectionAction>(`
    SELECT c.*, t.capture_id, t.golden_tag
    FROM collections_actions c
    LEFT JOIN order_journey_trace t ON t.invoice_id = c.invoice_id
    WHERE c.invoice_id = '${escapeSqlString(invoiceId)}'
      AND c.status <> 'resolved'
    ORDER BY c.created_at DESC, c.action_id DESC
    LIMIT 1
  `);
}

export async function createCollectionActions(input: {
  items: Array<{
    customer_id: string;
    invoice_id: string;
    action_type: string;
    priority_score: number;
    recommended_message: string;
  }>;
  created_by: string;
}) {
  const created: CollectionAction[] = [];

  for (const item of input.items) {
    await dbRun(`
      UPDATE collections_actions
      SET status = 'resolved'
      WHERE invoice_id = '${escapeSqlString(item.invoice_id)}'
        AND status <> 'resolved'
    `);

    const actionId = `COL-${randomUUID().slice(0, 8)}`;
    await dbRun(`
      INSERT INTO collections_actions VALUES (
        '${actionId}',
        '${escapeSqlString(item.customer_id)}',
        '${escapeSqlString(item.invoice_id)}',
        '${escapeSqlString(item.action_type)}',
        ${item.priority_score},
        '${escapeSqlString(item.recommended_message)}',
        'open',
        '${escapeSqlString(input.created_by)}',
        now()
      )
    `);

    created.push({
      action_id: actionId,
      customer_id: item.customer_id,
      invoice_id: item.invoice_id,
      action_type: item.action_type,
      priority_score: item.priority_score,
      recommended_message: item.recommended_message,
      status: "open",
      created_by: input.created_by,
      created_at: new Date().toISOString(),
    });
  }

  await logEvent("collections_actions", "batch", "collections.created", input.created_by, { count: created.length });

  return created;
}

export async function updateCollectionActionStatus(actionId: string, status: "contacted" | "resolved") {
  await dbRun(`
    UPDATE collections_actions
    SET status = '${status}'
    WHERE action_id = '${escapeSqlString(actionId)}'
  `);

  await logEvent("collections_actions", actionId, "collections.status.updated", "api", { status });
}

export async function getKpis(): Promise<Kpis> {
  const autoMatch = await dbGet<{ value: number }>(`
    SELECT
      CASE
        WHEN total_payments = 0 THEN 0
        ELSE matched_payments * 1.0 / total_payments
      END AS value
    FROM (
      SELECT
        (SELECT COUNT(*) FROM payments) AS total_payments,
        (SELECT COUNT(DISTINCT payment_id) FROM allocations) AS matched_payments
    )
  `);

  const unapplied = await dbGet<{ value: number }>(`SELECT COALESCE(SUM(amount_unapplied), 0) AS value FROM payments`);

  const disputeRate = await dbGet<{ value: number }>(`
    SELECT
      CASE
        WHEN total_invoices = 0 THEN 0
        ELSE disputed_invoices * 1.0 / total_invoices
      END AS value
    FROM (
      SELECT
        (SELECT COUNT(*) FROM invoices) AS total_invoices,
        (SELECT COUNT(DISTINCT invoice_id) FROM disputes) AS disputed_invoices
    )
  `);

  const dso = await dbGet<{ value: number }>(`
    SELECT
      CASE
        WHEN SUM(amount_open) = 0 THEN 0
        ELSE SUM(amount_open * date_diff('day', invoice_date, CURRENT_DATE)) / SUM(amount_open)
      END AS value
    FROM invoices
    WHERE amount_open > 0
  `);

  return {
    auto_match_rate: Number(autoMatch?.value ?? 0),
    unapplied_cash: Number(unapplied?.value ?? 0),
    dispute_rate: Number(disputeRate?.value ?? 0),
    dso_proxy: Number(dso?.value ?? 0),
  };
}

export async function createCapturedOrder(input: {
  source: OrderCaptureSource;
  customer_name: string;
  customer_email: string;
  po_number: string;
  requested_date: string;
  ship_to: string;
  currency: string;
  total_amount: number;
  line_items: OrderLineItem[];
  extraction_confidence: number;
  requires_review: boolean;
  processing_seconds: number;
  created_by: string;
  input_payload?: Record<string, unknown>;
}): Promise<CapturedOrder> {
  await ensureOrderCaptureTable();
  const captureId = `ORDCAP-${randomUUID().slice(0, 8)}`;
  const lineItemsJson = JSON.stringify(input.line_items ?? []);

  await dbRun(`
    INSERT INTO order_capture_orders VALUES (
      '${captureId}',
      '${escapeSqlString(input.source)}',
      '${escapeSqlString(input.customer_name)}',
      '${escapeSqlString(input.customer_email)}',
      '${escapeSqlString(input.po_number)}',
      '${escapeSqlString(input.requested_date)}',
      '${escapeSqlString(input.ship_to)}',
      '${escapeSqlString(input.currency)}',
      ${input.total_amount},
      '${escapeSqlString(lineItemsJson)}',
      ${input.extraction_confidence},
      ${input.requires_review ? "TRUE" : "FALSE"},
      ${Math.max(0, input.processing_seconds)},
      '${escapeSqlString(input.created_by)}',
      now()
    )
  `);

  await logEvent("order_capture_orders", captureId, "order.capture.created", input.created_by, {
    source: input.source,
    po_number: input.po_number,
    requires_review: input.requires_review,
    extraction_confidence: input.extraction_confidence,
    ...input.input_payload,
  });

  const created = await dbGet<CapturedOrder>(`
    SELECT *
    FROM order_capture_orders
    WHERE capture_id = '${escapeSqlString(captureId)}'
  `);

  if (!created) {
    throw new Error("Failed to create captured order");
  }

  return created;
}

export async function listCapturedOrders(limit = 100): Promise<CapturedOrder[]> {
  await ensureOrderCaptureTable();
  return dbAll<CapturedOrder>(`
    SELECT *
    FROM order_capture_orders
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);
}

export async function listOrderValidationActions(limit = 200): Promise<OrderValidationAction[]> {
  await ensureOrderValidationActionsTable();
  return dbAll<OrderValidationAction>(`
    SELECT action_id, capture_id, action, actor, created_at
    FROM order_validation_actions
    ORDER BY created_at DESC, action_id DESC
    LIMIT ${limit}
  `);
}

export async function listValidatedOrders(limit = 100): Promise<ValidatedOrder[]> {
  await ensureOrderCaptureTable();
  await ensureOrderValidationActionsTable();
  return dbAll<ValidatedOrder>(`
    WITH latest_validation AS (
      SELECT *
      FROM (
        SELECT
          action_id,
          capture_id,
          action,
          actor,
          created_at,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM order_validation_actions
      )
      WHERE rn = 1
    )
    SELECT
      o.*,
      v.action AS validation_action,
      v.actor AS validation_actor,
      v.created_at AS validation_created_at
    FROM order_capture_orders o
    INNER JOIN latest_validation v ON v.capture_id = o.capture_id
    WHERE v.action = 'accept'
    ORDER BY v.created_at DESC, o.created_at DESC
    LIMIT ${limit}
  `);
}

export async function listValidationQueueOrders(limit = 100): Promise<CapturedOrder[]> {
  await ensureOrderCaptureTable();
  await ensureOrderValidationActionsTable();
  return dbAll<CapturedOrder>(`
    WITH latest_validation AS (
      SELECT *
      FROM (
        SELECT
          capture_id,
          action,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM order_validation_actions
      )
      WHERE rn = 1
    )
    SELECT o.*
    FROM order_capture_orders o
    LEFT JOIN latest_validation v ON v.capture_id = o.capture_id
    WHERE v.capture_id IS NULL OR v.action <> 'accept'
    ORDER BY o.created_at DESC
    LIMIT ${limit}
  `);
}

export async function listCreditRiskActions(limit = 200): Promise<CreditRiskAction[]> {
  await ensureCreditRiskActionsTable();
  return dbAll<CreditRiskAction>(`
    SELECT *
    FROM credit_risk_actions
    ORDER BY created_at DESC, action_id DESC
    LIMIT ${limit}
  `);
}

export async function listHoldResolutionActions(limit = 200): Promise<Array<{
  action_id: string;
  capture_id: string;
  recommended_decision: string;
  final_decision: string;
  owner_team: string;
  resolution_summary: string;
  actor: string;
  created_at: string;
}>> {
  await ensureHoldResolutionActionsTable();
  return dbAll(`
    SELECT *
    FROM hold_resolution_actions
    ORDER BY created_at DESC, action_id DESC
    LIMIT ${limit}
  `);
}

export async function listCreditRatedOrders(limit = 100): Promise<CreditRatedOrder[]> {
  await ensureOrderCaptureTable();
  await ensureOrderValidationActionsTable();
  await ensureCreditRiskActionsTable();
  return dbAll<CreditRatedOrder>(`
    WITH latest_validation AS (
      SELECT *
      FROM (
        SELECT
          capture_id,
          action,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM order_validation_actions
      )
      WHERE rn = 1
    ),
    latest_credit AS (
      SELECT *
      FROM (
        SELECT
          capture_id,
          recommended_decision,
          final_decision,
          risk_score,
          revenue_at_risk,
          bad_debt_delta,
          created_at,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM credit_risk_actions
      )
      WHERE rn = 1
    )
    SELECT
      o.*,
      v.action AS validation_action,
      c.recommended_decision AS credit_recommended_decision,
      c.final_decision AS credit_final_decision,
      c.risk_score AS credit_risk_score,
      c.revenue_at_risk AS credit_revenue_at_risk,
      c.bad_debt_delta AS credit_bad_debt_delta,
      c.created_at AS credit_action_created_at
    FROM order_capture_orders o
    INNER JOIN latest_credit c ON c.capture_id = o.capture_id
    LEFT JOIN latest_validation v ON v.capture_id = o.capture_id
    ORDER BY c.created_at DESC, o.created_at DESC
    LIMIT ${limit}
  `);
}

export async function listCreditReviewQueueOrders(limit = 100): Promise<ValidatedOrder[]> {
  await ensureOrderCaptureTable();
  await ensureOrderValidationActionsTable();
  await ensureCreditRiskActionsTable();
  return dbAll<ValidatedOrder>(`
    WITH latest_validation AS (
      SELECT *
      FROM (
        SELECT
          action_id,
          capture_id,
          action,
          actor,
          created_at,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM order_validation_actions
      )
      WHERE rn = 1
    ),
    latest_credit AS (
      SELECT *
      FROM (
        SELECT
          capture_id,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM credit_risk_actions
      )
      WHERE rn = 1
    )
    SELECT
      o.*,
      v.action AS validation_action,
      v.actor AS validation_actor,
      v.created_at AS validation_created_at
    FROM order_capture_orders o
    INNER JOIN latest_validation v ON v.capture_id = o.capture_id
    LEFT JOIN latest_credit c ON c.capture_id = o.capture_id
    WHERE v.action = 'accept' AND c.capture_id IS NULL
    ORDER BY v.created_at DESC, o.created_at DESC
    LIMIT ${limit}
  `);
}

export async function listHeldOrders(limit = 100): Promise<HeldOrder[]> {
  await ensureOrderCaptureTable();
  await ensureOrderValidationActionsTable();
  await ensureCreditRiskActionsTable();
  await ensureHoldResolutionActionsTable();
  return dbAll<HeldOrder>(`
    WITH latest_validation AS (
      SELECT *
      FROM (
        SELECT
          capture_id,
          action,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM order_validation_actions
      )
      WHERE rn = 1
    ),
    latest_credit AS (
      SELECT *
      FROM (
        SELECT
          capture_id,
          recommended_decision,
          final_decision,
          risk_score,
          revenue_at_risk,
          bad_debt_delta,
          rationale_json,
          created_at,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM credit_risk_actions
      )
      WHERE rn = 1
    ),
    latest_hold AS (
      SELECT *
      FROM (
        SELECT
          capture_id,
          final_decision,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM hold_resolution_actions
      )
      WHERE rn = 1
    )
    SELECT
      o.*,
      v.action AS validation_action,
      c.recommended_decision AS credit_recommended_decision,
      c.final_decision AS credit_final_decision,
      c.risk_score AS credit_risk_score,
      c.revenue_at_risk AS credit_revenue_at_risk,
      c.bad_debt_delta AS credit_bad_debt_delta,
      c.created_at AS credit_action_created_at,
      c.rationale_json AS hold_reasons
    FROM order_capture_orders o
    INNER JOIN latest_credit c ON c.capture_id = o.capture_id
    LEFT JOIN latest_validation v ON v.capture_id = o.capture_id
    LEFT JOIN latest_hold h ON h.capture_id = o.capture_id
    WHERE c.final_decision = 'hold'
      AND (h.capture_id IS NULL OR h.final_decision NOT IN ('release', 'conditional_release', 'escalate'))
    ORDER BY c.created_at DESC, o.created_at DESC
    LIMIT ${limit}
  `).then((rows) =>
    rows.map((row) => ({
      ...row,
      hold_reasons: (() => {
        try {
          const parsed = JSON.parse(String((row as unknown as { hold_reasons: string }).hold_reasons ?? "[]"));
          return Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
          return [];
        }
      })(),
    })),
  );
}

export async function listInventoryPositions(limit = 200): Promise<InventoryPosition[]> {
  await ensureInventoryPositionsTable();
  return dbAll<InventoryPosition>(`
    SELECT *
    FROM inventory_positions
    ORDER BY sku ASC, location ASC
    LIMIT ${limit}
  `);
}

export async function listAllocationEligibleOrders(limit = 100): Promise<AllocationEligibleOrder[]> {
  await ensureOrderCaptureTable();
  await ensureOrderValidationActionsTable();
  await ensureCreditRiskActionsTable();
  await ensureHoldResolutionActionsTable();
  await ensureInventoryAllocationActionsTable();
  return dbAll<AllocationEligibleOrder>(`
    WITH latest_validation AS (
      SELECT *
      FROM (
        SELECT
          capture_id,
          action,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM order_validation_actions
      )
      WHERE rn = 1
    ),
    latest_credit AS (
      SELECT *
      FROM (
        SELECT
          capture_id,
          recommended_decision,
          final_decision,
          risk_score,
          revenue_at_risk,
          bad_debt_delta,
          created_at,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM credit_risk_actions
      )
      WHERE rn = 1
    ),
    latest_hold AS (
      SELECT *
      FROM (
        SELECT
          capture_id,
          final_decision,
          created_at,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM hold_resolution_actions
      )
      WHERE rn = 1
    ),
    latest_inventory AS (
      SELECT *
      FROM (
        SELECT
          capture_id,
          final_decision,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM inventory_allocation_actions
      )
      WHERE rn = 1
    )
    SELECT
      o.*,
      v.action AS validation_action,
      c.recommended_decision AS credit_recommended_decision,
      c.final_decision AS credit_final_decision,
      c.risk_score AS credit_risk_score,
      c.revenue_at_risk AS credit_revenue_at_risk,
      c.bad_debt_delta AS credit_bad_debt_delta,
      c.created_at AS credit_action_created_at,
      CASE
        WHEN c.final_decision IN ('approve', 'conditional') THEN c.final_decision
        WHEN c.final_decision = 'hold' AND h.final_decision IN ('release', 'conditional_release') THEN h.final_decision
        ELSE NULL
      END AS allocation_release_status
    FROM order_capture_orders o
    INNER JOIN latest_validation v ON v.capture_id = o.capture_id
    INNER JOIN latest_credit c ON c.capture_id = o.capture_id
    LEFT JOIN latest_hold h ON h.capture_id = o.capture_id
    LEFT JOIN latest_inventory i ON i.capture_id = o.capture_id
    WHERE v.action = 'accept'
      AND (
        c.final_decision IN ('approve', 'conditional')
        OR (c.final_decision = 'hold' AND h.final_decision IN ('release', 'conditional_release'))
      )
      AND i.capture_id IS NULL
    ORDER BY o.created_at DESC
    LIMIT ${limit}
  `);
}

export async function getLatestInventoryAllocationAction(captureId: string): Promise<{
  action_id: string;
  capture_id: string;
  recommended_decision: string;
  final_decision: string;
  fill_rate: number;
  revenue_at_risk: number;
  summary: string;
  line_results_json: string;
  actor: string;
  created_at: string;
} | null> {
  await ensureInventoryAllocationActionsTable();
  return dbGet(`
    SELECT *
    FROM inventory_allocation_actions
    WHERE capture_id = '${escapeSqlString(captureId)}'
    ORDER BY created_at DESC, action_id DESC
    LIMIT 1
  `);
}

export async function listInventoryAllocationActions(limit = 200): Promise<Array<{
  action_id: string;
  capture_id: string;
  recommended_decision: string;
  final_decision: string;
  fill_rate: number;
  revenue_at_risk: number;
  summary: string;
  line_results_json: string;
  actor: string;
  created_at: string;
}>> {
  await ensureInventoryAllocationActionsTable();
  return dbAll(`
    SELECT *
    FROM inventory_allocation_actions
    ORDER BY created_at DESC, action_id DESC
    LIMIT ${limit}
  `);
}

export async function listShipmentPlanningQueueOrders(limit = 100): Promise<AllocationEligibleOrder[]> {
  await ensureOrderCaptureTable();
  await ensureOrderValidationActionsTable();
  await ensureCreditRiskActionsTable();
  await ensureHoldResolutionActionsTable();
  await ensureInventoryAllocationActionsTable();
  await ensureWorkflowAgentActionsTable();
  return dbAll<AllocationEligibleOrder>(`
    WITH latest_validation AS (
      SELECT * FROM (
        SELECT capture_id, action, ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM order_validation_actions
      ) WHERE rn = 1
    ),
    latest_credit AS (
      SELECT * FROM (
        SELECT capture_id, recommended_decision, final_decision, risk_score, revenue_at_risk, bad_debt_delta, created_at,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM credit_risk_actions
      ) WHERE rn = 1
    ),
    latest_hold AS (
      SELECT * FROM (
        SELECT capture_id, final_decision, ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM hold_resolution_actions
      ) WHERE rn = 1
    ),
    latest_inventory AS (
      SELECT * FROM (
        SELECT capture_id, final_decision, ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM inventory_allocation_actions
      ) WHERE rn = 1
    ),
    latest_shipment AS (
      SELECT * FROM (
        SELECT subject_id, final_decision, ROW_NUMBER() OVER (PARTITION BY subject_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM workflow_agent_actions
        WHERE agent_id = 'shipment-planning' AND subject_type = 'order'
      ) WHERE rn = 1
    )
    SELECT
      o.*,
      v.action AS validation_action,
      c.recommended_decision AS credit_recommended_decision,
      c.final_decision AS credit_final_decision,
      c.risk_score AS credit_risk_score,
      c.revenue_at_risk AS credit_revenue_at_risk,
      c.bad_debt_delta AS credit_bad_debt_delta,
      c.created_at AS credit_action_created_at,
      CASE
        WHEN c.final_decision IN ('approve', 'conditional') THEN c.final_decision
        WHEN c.final_decision = 'hold' AND h.final_decision IN ('release', 'conditional_release') THEN h.final_decision
        ELSE NULL
      END AS allocation_release_status
    FROM order_capture_orders o
    INNER JOIN latest_validation v ON v.capture_id = o.capture_id
    INNER JOIN latest_credit c ON c.capture_id = o.capture_id
    LEFT JOIN latest_hold h ON h.capture_id = o.capture_id
    INNER JOIN latest_inventory i ON i.capture_id = o.capture_id
    LEFT JOIN latest_shipment s ON s.subject_id = o.capture_id
    WHERE v.action = 'accept'
      AND i.final_decision = 'accepted'
      AND s.subject_id IS NULL
    ORDER BY o.created_at DESC
    LIMIT ${limit}
  `);
}

export async function listBillingQueueOrders(limit = 100): Promise<AllocationEligibleOrder[]> {
  await ensureOrderCaptureTable();
  await ensureOrderValidationActionsTable();
  await ensureCreditRiskActionsTable();
  await ensureHoldResolutionActionsTable();
  await ensureWorkflowAgentActionsTable();
  return dbAll<AllocationEligibleOrder>(`
    WITH latest_validation AS (
      SELECT * FROM (
        SELECT capture_id, action, ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM order_validation_actions
      ) WHERE rn = 1
    ),
    latest_credit AS (
      SELECT * FROM (
        SELECT capture_id, recommended_decision, final_decision, risk_score, revenue_at_risk, bad_debt_delta, created_at,
          ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM credit_risk_actions
      ) WHERE rn = 1
    ),
    latest_hold AS (
      SELECT * FROM (
        SELECT capture_id, final_decision, ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM hold_resolution_actions
      ) WHERE rn = 1
    ),
    latest_shipment AS (
      SELECT * FROM (
        SELECT subject_id, final_decision, ROW_NUMBER() OVER (PARTITION BY subject_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM workflow_agent_actions
        WHERE agent_id = 'shipment-planning' AND subject_type = 'order'
      ) WHERE rn = 1
    ),
    latest_billing AS (
      SELECT * FROM (
        SELECT subject_id, final_decision, ROW_NUMBER() OVER (PARTITION BY subject_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM workflow_agent_actions
        WHERE agent_id = 'billing-intelligence' AND subject_type = 'order'
      ) WHERE rn = 1
    )
    SELECT
      o.*,
      v.action AS validation_action,
      c.recommended_decision AS credit_recommended_decision,
      c.final_decision AS credit_final_decision,
      c.risk_score AS credit_risk_score,
      c.revenue_at_risk AS credit_revenue_at_risk,
      c.bad_debt_delta AS credit_bad_debt_delta,
      c.created_at AS credit_action_created_at,
      CASE
        WHEN c.final_decision IN ('approve', 'conditional') THEN c.final_decision
        WHEN c.final_decision = 'hold' AND h.final_decision IN ('release', 'conditional_release') THEN h.final_decision
        ELSE NULL
      END AS allocation_release_status
    FROM order_capture_orders o
    INNER JOIN latest_validation v ON v.capture_id = o.capture_id
    INNER JOIN latest_credit c ON c.capture_id = o.capture_id
    LEFT JOIN latest_hold h ON h.capture_id = o.capture_id
    INNER JOIN latest_shipment s ON s.subject_id = o.capture_id
    LEFT JOIN latest_billing b ON b.subject_id = o.capture_id
    WHERE v.action = 'accept'
      AND s.subject_id IS NOT NULL
      AND b.subject_id IS NULL
    ORDER BY o.created_at DESC
    LIMIT ${limit}
  `);
}

export async function listInvoiceMatchingQueue(limit = 100): Promise<Invoice[]> {
  await ensureWorkflowAgentActionsTable();
  await ensureOrderJourneyTraceTable();
  return dbAll<Invoice>(`
    WITH latest_matching AS (
      SELECT * FROM (
        SELECT subject_id, final_decision, ROW_NUMBER() OVER (PARTITION BY subject_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM workflow_agent_actions
        WHERE agent_id = 'invoice-matching' AND subject_type = 'invoice'
      ) WHERE rn = 1
    )
    SELECT i.*, t.capture_id, t.golden_tag
    FROM invoices i
    LEFT JOIN latest_matching m ON m.subject_id = i.invoice_id
    LEFT JOIN order_journey_trace t ON t.invoice_id = i.invoice_id
    WHERE m.subject_id IS NULL OR m.final_decision IN ('variance_detected', 'investigate')
    ORDER BY i.due_date ASC
    LIMIT ${limit}
  `);
}

export async function listPaymentPredictionQueue(limit = 100): Promise<Customer[]> {
  await ensureWorkflowAgentActionsTable();
  return dbAll<Customer>(`
    WITH latest_prediction AS (
      SELECT * FROM (
        SELECT subject_id, ROW_NUMBER() OVER (PARTITION BY subject_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM workflow_agent_actions
        WHERE agent_id = 'payment-prediction' AND subject_type = 'customer'
      ) WHERE rn = 1
    )
    SELECT c.*
    FROM customers c
    WHERE EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.customer_id = c.customer_id AND i.amount_open > 0
    )
      AND NOT EXISTS (
        SELECT 1 FROM latest_prediction p
        WHERE p.subject_id = c.customer_id
      )
    ORDER BY c.risk_score DESC, c.customer_id ASC
    LIMIT ${limit}
  `);
}

export async function listCollectionsCommunicationQueue(limit = 100): Promise<CollectionAction[]> {
  await ensureWorkflowAgentActionsTable();
  await ensureOrderJourneyTraceTable();
  return dbAll<CollectionAction>(`
    WITH latest_collection AS (
      SELECT * FROM (
        SELECT
          action_id,
          invoice_id,
          customer_id,
          action_type,
          priority_score,
          recommended_message,
          status,
          created_by,
          created_at,
          ROW_NUMBER() OVER (PARTITION BY invoice_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM collections_actions
      ) WHERE rn = 1
    ),
    latest_comms AS (
      SELECT * FROM (
        SELECT subject_id, ROW_NUMBER() OVER (PARTITION BY subject_id ORDER BY created_at DESC, action_id DESC) AS rn
        FROM workflow_agent_actions
        WHERE agent_id = 'collections-communications' AND subject_type = 'invoice'
      ) WHERE rn = 1
    )
    SELECT lc.*, t.capture_id, t.golden_tag
    FROM latest_collection lc
    LEFT JOIN latest_comms m ON m.subject_id = lc.invoice_id
    LEFT JOIN order_journey_trace t ON t.invoice_id = lc.invoice_id
    WHERE lc.status <> 'resolved' AND m.subject_id IS NULL
    ORDER BY lc.priority_score DESC, lc.created_at DESC
    LIMIT ${limit}
  `);
}

export async function listCashApplicationQueuePayments(limit = 100): Promise<Payment[]> {
  await ensureOrderJourneyTraceTable();
  return dbAll<Payment>(`
    WITH payment_allocations AS (
      SELECT payment_id, COALESCE(SUM(allocated_amount), 0) AS allocated_total
      FROM allocations
      GROUP BY payment_id
    ),
    invoice_allocations AS (
      SELECT invoice_id, COALESCE(SUM(allocated_amount), 0) AS allocated_total
      FROM allocations
      GROUP BY invoice_id
    )
    SELECT
      p.payment_id,
      p.customer_id,
      p.payment_date,
      p.amount_total,
      GREATEST(p.amount_total - COALESCE(pa.allocated_total, 0), 0) AS amount_unapplied,
      p.payment_ref,
      p.remittance_text,
      t.capture_id,
      t.golden_tag
    FROM payments p
    LEFT JOIN payment_allocations pa ON pa.payment_id = p.payment_id
    LEFT JOIN order_journey_trace t ON t.payment_id = p.payment_id
    WHERE GREATEST(p.amount_total - COALESCE(pa.allocated_total, 0), 0) > 0
      AND EXISTS (
        SELECT 1
        FROM invoices i
        LEFT JOIN invoice_allocations ia ON ia.invoice_id = i.invoice_id
        WHERE i.customer_id = p.customer_id
          AND GREATEST(i.amount_total - COALESCE(ia.allocated_total, 0), 0) > 0
      )
    ORDER BY p.payment_date DESC, p.payment_id DESC
    LIMIT ${limit}
  `);
}

export async function listCashApplicationQueueCustomers(limit = 100): Promise<CashApplicationQueueCustomer[]> {
  return dbAll<CashApplicationQueueCustomer>(`
    WITH payment_totals AS (
      SELECT
        p.customer_id,
        COUNT(*) AS unapplied_payment_count,
        SUM(GREATEST(p.amount_total - COALESCE(a.allocated_total, 0), 0)) AS unapplied_cash_total
      FROM payments p
      LEFT JOIN (
        SELECT payment_id, COALESCE(SUM(allocated_amount), 0) AS allocated_total
        FROM allocations
        GROUP BY payment_id
      ) a ON a.payment_id = p.payment_id
      WHERE GREATEST(p.amount_total - COALESCE(a.allocated_total, 0), 0) > 0
      GROUP BY p.customer_id
    ),
    invoice_totals AS (
      SELECT
        i.customer_id,
        COUNT(*) AS open_invoice_count,
        SUM(GREATEST(i.amount_total - COALESCE(a.allocated_total, 0), 0)) AS open_ar_total
      FROM invoices i
      LEFT JOIN (
        SELECT invoice_id, COALESCE(SUM(allocated_amount), 0) AS allocated_total
        FROM allocations
        GROUP BY invoice_id
      ) a ON a.invoice_id = i.invoice_id
      WHERE GREATEST(i.amount_total - COALESCE(a.allocated_total, 0), 0) > 0
      GROUP BY i.customer_id
    )
    SELECT
      c.customer_id,
      c.name AS customer_name,
      p.unapplied_payment_count,
      i.open_invoice_count,
      p.unapplied_cash_total,
      i.open_ar_total
    FROM customers c
    INNER JOIN payment_totals p ON p.customer_id = c.customer_id
    INNER JOIN invoice_totals i ON i.customer_id = c.customer_id
    ORDER BY p.unapplied_cash_total DESC, i.open_ar_total DESC, c.customer_id ASC
    LIMIT ${limit}
  `);
}

export async function listOpenDisputes(limit = 100): Promise<Dispute[]> {
  await ensureOrderJourneyTraceTable();
  return dbAll<Dispute>(`
    SELECT d.*, t.capture_id, t.golden_tag
    FROM disputes d
    LEFT JOIN order_journey_trace t ON t.dispute_id = d.dispute_id
    WHERE d.status <> 'resolved'
    ORDER BY d.created_at DESC
    LIMIT ${limit}
  `);
}

export async function getLifecycleTrace(captureId: string): Promise<Record<string, unknown> | null> {
  await ensureOrderJourneyTraceTable();
  return dbGet(`
    SELECT
      t.*,
      o.po_number,
      o.customer_name,
      o.customer_email
    FROM order_journey_trace t
    LEFT JOIN order_capture_orders o ON o.capture_id = t.capture_id
    WHERE t.capture_id = '${escapeSqlString(captureId)}'
  `);
}

export async function getLatestWorkflowAgentAction(agentId: string, subjectType: string, subjectId: string): Promise<WorkflowAgentAction | null> {
  await ensureWorkflowAgentActionsTable();
  return dbGet<WorkflowAgentAction>(`
    SELECT *
    FROM workflow_agent_actions
    WHERE agent_id = '${escapeSqlString(agentId)}'
      AND subject_type = '${escapeSqlString(subjectType)}'
      AND subject_id = '${escapeSqlString(subjectId)}'
    ORDER BY created_at DESC, action_id DESC
    LIMIT 1
  `);
}

export async function listWorkflowAgentActionsByAgent(agentId: string, limit = 200): Promise<WorkflowAgentAction[]> {
  await ensureWorkflowAgentActionsTable();
  return dbAll<WorkflowAgentAction>(`
    SELECT *
    FROM workflow_agent_actions
    WHERE agent_id = '${escapeSqlString(agentId)}'
    ORDER BY created_at DESC, action_id DESC
    LIMIT ${limit}
  `);
}

export async function listAgentInsightsByAgent(agentId: string, limit = 200): Promise<AgentInsight[]> {
  await ensureAgentInsightsTable();
  return dbAll<AgentInsight>(`
    SELECT *
    FROM agent_insights
    WHERE agent_id = '${escapeSqlString(agentId)}'
    ORDER BY created_at DESC, insight_id DESC
    LIMIT ${limit}
  `);
}

export async function updateCapturedOrderForValidation(input: {
  capture_id: string;
  customer_name: string;
  customer_email: string;
  po_number: string;
  requested_date: string;
  ship_to: string;
  currency: string;
  total_amount: number;
  line_items: OrderLineItem[];
  requires_review: boolean;
  actor: string;
}) {
  await ensureOrderCaptureTable();

  await dbRun(`
    UPDATE order_capture_orders
    SET customer_name = '${escapeSqlString(input.customer_name)}',
        customer_email = '${escapeSqlString(input.customer_email)}',
        po_number = '${escapeSqlString(input.po_number)}',
        requested_date = '${escapeSqlString(input.requested_date)}',
        ship_to = '${escapeSqlString(input.ship_to)}',
        currency = '${escapeSqlString(input.currency.toUpperCase())}',
        total_amount = ${input.total_amount},
        line_items_json = '${escapeSqlString(JSON.stringify(input.line_items))}',
        requires_review = ${input.requires_review ? "TRUE" : "FALSE"}
    WHERE capture_id = '${escapeSqlString(input.capture_id)}'
  `);

  await logEvent("order_capture_orders", input.capture_id, "order.validation.applied", input.actor, {
    requires_review: input.requires_review,
  });

  return getCapturedOrder(input.capture_id);
}

export async function createOrderValidationAction(input: {
  capture_id: string;
  action: "accept" | "reject" | "decline";
  original: Record<string, unknown>;
  proposed: Record<string, unknown>;
  discrepancies: Record<string, unknown>[];
  actor: string;
}) {
  await ensureOrderValidationActionsTable();
  const actionId = `VAL-${randomUUID().slice(0, 8)}`;

  await dbRun(`
    INSERT INTO order_validation_actions VALUES (
      '${actionId}',
      '${escapeSqlString(input.capture_id)}',
      '${escapeSqlString(input.action)}',
      '${escapeSqlString(JSON.stringify(input.original))}',
      '${escapeSqlString(JSON.stringify(input.proposed))}',
      '${escapeSqlString(JSON.stringify(input.discrepancies))}',
      '${escapeSqlString(input.actor)}',
      now()
    )
  `);

  await logEvent("order_validation_actions", actionId, "order.validation.action", input.actor, {
    capture_id: input.capture_id,
    action: input.action,
    discrepancies: input.discrepancies.length,
  });
}

export async function createCreditRiskAction(input: {
  capture_id: string;
  recommended_decision: "approve" | "conditional" | "hold";
  final_decision: "approve" | "conditional" | "hold" | "escalate";
  risk_score: number;
  revenue_at_risk: number;
  bad_debt_delta: number;
  rationale: string[];
  override_reason?: string;
  actor: string;
}) {
  await ensureCreditRiskActionsTable();
  const actionId = `CRD-${randomUUID().slice(0, 8)}`;

  await dbRun(`
    INSERT INTO credit_risk_actions VALUES (
      '${actionId}',
      '${escapeSqlString(input.capture_id)}',
      '${escapeSqlString(input.recommended_decision)}',
      '${escapeSqlString(input.final_decision)}',
      ${input.risk_score},
      ${input.revenue_at_risk},
      ${input.bad_debt_delta},
      '${escapeSqlString(JSON.stringify(input.rationale))}',
      '${escapeSqlString(input.override_reason ?? "")}',
      '${escapeSqlString(input.actor)}',
      now()
    )
  `);

  await logEvent("credit_risk_actions", actionId, "credit.risk.action", input.actor, {
    capture_id: input.capture_id,
    recommended_decision: input.recommended_decision,
    final_decision: input.final_decision,
    risk_score: input.risk_score,
  });
}

export async function createHoldResolutionAction(input: {
  capture_id: string;
  recommended_decision: "release" | "conditional_release" | "escalate";
  final_decision: "release" | "conditional_release" | "escalate" | "keep_on_hold";
  owner_team: string;
  resolution_summary: string;
  actor: string;
}) {
  await ensureHoldResolutionActionsTable();
  const actionId = `HLD-${randomUUID().slice(0, 8)}`;

  await dbRun(`
    INSERT INTO hold_resolution_actions VALUES (
      '${actionId}',
      '${escapeSqlString(input.capture_id)}',
      '${escapeSqlString(input.recommended_decision)}',
      '${escapeSqlString(input.final_decision)}',
      '${escapeSqlString(input.owner_team)}',
      '${escapeSqlString(input.resolution_summary)}',
      '${escapeSqlString(input.actor)}',
      now()
    )
  `);

  await logEvent("hold_resolution_actions", actionId, "hold.resolution.action", input.actor, {
    capture_id: input.capture_id,
    recommended_decision: input.recommended_decision,
    final_decision: input.final_decision,
    owner_team: input.owner_team,
  });
}

export async function createInventoryAllocationAction(input: {
  capture_id: string;
  recommended_decision:
    | "allocate_full"
    | "allocate_partial"
    | "substitute"
    | "split_shipment"
    | "backorder"
    | "escalate";
  final_decision:
    | "allocate_full"
    | "allocate_partial"
    | "substitute"
    | "split_shipment"
    | "backorder"
    | "escalate"
    | "accepted";
  fill_rate: number;
  revenue_at_risk: number;
  summary: string;
  line_results_json: string;
  actor: string;
}) {
  await ensureInventoryAllocationActionsTable();
  const actionId = `INV-${randomUUID().slice(0, 8)}`;

  await dbRun(`
    INSERT INTO inventory_allocation_actions VALUES (
      '${actionId}',
      '${escapeSqlString(input.capture_id)}',
      '${escapeSqlString(input.recommended_decision)}',
      '${escapeSqlString(input.final_decision)}',
      ${input.fill_rate},
      ${input.revenue_at_risk},
      '${escapeSqlString(input.summary)}',
      '${escapeSqlString(input.line_results_json)}',
      '${escapeSqlString(input.actor)}',
      now()
    )
  `);

  await logEvent("inventory_allocation_actions", actionId, "inventory.allocation.action", input.actor, {
    capture_id: input.capture_id,
    recommended_decision: input.recommended_decision,
    final_decision: input.final_decision,
    fill_rate: input.fill_rate,
  });
}

export async function createWorkflowAgentAction(input: {
  agent_id: string;
  subject_type: string;
  subject_id: string;
  recommended_decision: string;
  final_decision: string;
  summary: string;
  payload_json: string;
  actor: string;
}) {
  await ensureWorkflowAgentActionsTable();
  const actionId = `WFA-${randomUUID().slice(0, 8)}`;

  await dbRun(`
    INSERT INTO workflow_agent_actions VALUES (
      '${actionId}',
      '${escapeSqlString(input.agent_id)}',
      '${escapeSqlString(input.subject_type)}',
      '${escapeSqlString(input.subject_id)}',
      '${escapeSqlString(input.recommended_decision)}',
      '${escapeSqlString(input.final_decision)}',
      '${escapeSqlString(input.summary)}',
      '${escapeSqlString(input.payload_json)}',
      '${escapeSqlString(input.actor)}',
      now()
    )
  `);

  await logEvent("workflow_agent_actions", actionId, `${input.agent_id}.action`, input.actor, {
    agent_id: input.agent_id,
    subject_type: input.subject_type,
    subject_id: input.subject_id,
    final_decision: input.final_decision,
  });
}

export async function createAgentInsight(input: {
  agent_id: string;
  insight_type: string;
  subject_id: string;
  severity: "low" | "medium" | "high";
  title: string;
  summary: string;
  payload_json: string;
  actor: string;
}) {
  await ensureAgentInsightsTable();
  const insightId = `INS-${randomUUID().slice(0, 8)}`;

  await dbRun(`
    INSERT INTO agent_insights VALUES (
      '${insightId}',
      '${escapeSqlString(input.agent_id)}',
      '${escapeSqlString(input.insight_type)}',
      '${escapeSqlString(input.subject_id)}',
      '${escapeSqlString(input.severity)}',
      '${escapeSqlString(input.title)}',
      '${escapeSqlString(input.summary)}',
      '${escapeSqlString(input.payload_json)}',
      '${escapeSqlString(input.actor)}',
      now()
    )
  `);

  await logEvent("agent_insights", insightId, `${input.agent_id}.insight`, input.actor, {
    agent_id: input.agent_id,
    insight_type: input.insight_type,
    severity: input.severity,
  });
}

export async function setCapturedOrderReviewFlag(input: {
  capture_id: string;
  requires_review: boolean;
  actor: string;
}) {
  await ensureOrderCaptureTable();
  await dbRun(`
    UPDATE order_capture_orders
    SET requires_review = ${input.requires_review ? "TRUE" : "FALSE"}
    WHERE capture_id = '${escapeSqlString(input.capture_id)}'
  `);

  await logEvent("order_capture_orders", input.capture_id, "order.review.flag.updated", input.actor, {
    requires_review: input.requires_review,
  });
}

export async function getCreditRiskKpis(): Promise<{
  credit_approval_time_minutes: number;
  bad_debt_proxy_rate: number;
  revenue_at_risk: number;
}> {
  await ensureCreditRiskActionsTable();
  const row = await dbGet<{
    actions: number;
    avg_risk: number;
    revenue_at_risk: number;
  }>(`
    SELECT
      COUNT(*) AS actions,
      COALESCE(AVG(risk_score), 0) AS avg_risk,
      COALESCE(SUM(revenue_at_risk), 0) AS revenue_at_risk
    FROM credit_risk_actions
  `);

  const actions = Number(row?.actions ?? 0);
  const avgRisk = Number(row?.avg_risk ?? 0);
  return {
    credit_approval_time_minutes: actions === 0 ? 0 : 2.5,
    bad_debt_proxy_rate: actions === 0 ? 0 : Math.min(0.35, avgRisk / 250),
    revenue_at_risk: Number(row?.revenue_at_risk ?? 0),
  };
}

export async function getOrderValidationKpis(): Promise<{
  order_error_rate: number;
  pricing_accuracy: number;
  fulfillment_accuracy: number;
}> {
  await ensureOrderValidationActionsTable();
  const row = await dbGet<{
    actions: number;
    accepted: number;
    rejected: number;
    declined: number;
  }>(`
    SELECT
      COUNT(*) AS actions,
      SUM(CASE WHEN action = 'accept' THEN 1 ELSE 0 END) AS accepted,
      SUM(CASE WHEN action = 'reject' THEN 1 ELSE 0 END) AS rejected,
      SUM(CASE WHEN action = 'decline' THEN 1 ELSE 0 END) AS declined
    FROM order_validation_actions
  `);

  const actions = Number(row?.actions ?? 0);
  const accepted = Number(row?.accepted ?? 0);
  const rejected = Number(row?.rejected ?? 0);
  const declined = Number(row?.declined ?? 0);

  return {
    order_error_rate: actions === 0 ? 0 : (rejected + declined) / actions,
    pricing_accuracy: actions === 0 ? 0 : accepted / actions,
    fulfillment_accuracy: actions === 0 ? 0 : Math.max(0, Math.min(1, (accepted + rejected * 0.5) / actions)),
  };
}

export async function getHoldResolutionKpis(): Promise<{
  hold_duration_days: number;
  revenue_delay: number;
  manual_touches: number;
}> {
  await ensureCreditRiskActionsTable();
  await ensureHoldResolutionActionsTable();
  const [held, resolved] = await Promise.all([
    dbGet<{ holds: number; revenue_delay: number }>(`
      SELECT
        COUNT(*) AS holds,
        COALESCE(SUM(revenue_at_risk), 0) AS revenue_delay
      FROM (
        SELECT *
        FROM (
          SELECT
            capture_id,
            final_decision,
            revenue_at_risk,
            created_at,
            ROW_NUMBER() OVER (PARTITION BY capture_id ORDER BY created_at DESC, action_id DESC) AS rn
          FROM credit_risk_actions
        )
        WHERE rn = 1 AND final_decision = 'hold'
      )
    `),
    dbGet<{ actions: number }>(`SELECT COUNT(*) AS actions FROM hold_resolution_actions`),
  ]);

  const holdCount = Number(held?.holds ?? 0);
  return {
    hold_duration_days: holdCount === 0 ? 0 : 3.2,
    revenue_delay: Number(held?.revenue_delay ?? 0),
    manual_touches: Number(resolved?.actions ?? 0),
  };
}

export async function getInventoryAllocationKpis(): Promise<{
  fill_rate: number;
  stockout_rate: number;
  backorder_age_days: number;
}> {
  await ensureInventoryPositionsTable();
  await ensureInventoryAllocationActionsTable();
  const [stock, actions] = await Promise.all([
    dbGet<{ total_positions: number; stockout_positions: number }>(`
      SELECT
        COUNT(*) AS total_positions,
        SUM(CASE WHEN available_qty <= 0 THEN 1 ELSE 0 END) AS stockout_positions
      FROM inventory_positions
    `),
    dbGet<{ avg_fill_rate: number; backorders: number }>(`
      SELECT
        COALESCE(AVG(fill_rate), 0) AS avg_fill_rate,
        SUM(CASE WHEN recommended_decision = 'backorder' THEN 1 ELSE 0 END) AS backorders
      FROM inventory_allocation_actions
    `),
  ]);

  const totalPositions = Number(stock?.total_positions ?? 0);
  const stockouts = Number(stock?.stockout_positions ?? 0);
  const backorders = Number(actions?.backorders ?? 0);
  return {
    fill_rate: Number(actions?.avg_fill_rate ?? 0),
    stockout_rate: totalPositions === 0 ? 0 : stockouts / totalPositions,
    backorder_age_days: backorders === 0 ? 0 : 4.5,
  };
}

export async function getWorkflowAgentKpis(agentId: string): Promise<{
  action_count: number;
  exception_rate: number;
  avg_cycle_proxy: number;
}> {
  await ensureWorkflowAgentActionsTable();
  const row = await dbGet<{ actions: number; exceptions: number }>(`
    SELECT
      COUNT(*) AS actions,
      SUM(CASE WHEN final_decision NOT IN ('accepted', 'scheduled', 'ready_to_invoice', 'matched', 'low', 'send') THEN 1 ELSE 0 END) AS exceptions
    FROM workflow_agent_actions
    WHERE agent_id = '${escapeSqlString(agentId)}'
  `);
  const actions = Number(row?.actions ?? 0);
  const exceptions = Number(row?.exceptions ?? 0);
  return {
    action_count: actions,
    exception_rate: actions === 0 ? 0 : exceptions / actions,
    avg_cycle_proxy: actions === 0 ? 0 : 1.8,
  };
}

export async function getInsightAgentKpis(agentId: string): Promise<{
  finding_count: number;
  high_severity_rate: number;
  impact_proxy: number;
}> {
  await ensureAgentInsightsTable();
  const row = await dbGet<{ findings: number; high_count: number }>(`
    SELECT
      COUNT(*) AS findings,
      SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) AS high_count
    FROM agent_insights
    WHERE agent_id = '${escapeSqlString(agentId)}'
  `);
  const findings = Number(row?.findings ?? 0);
  const high = Number(row?.high_count ?? 0);
  return {
    finding_count: findings,
    high_severity_rate: findings === 0 ? 0 : high / findings,
    impact_proxy: findings === 0 ? 0 : findings * 1.25,
  };
}

export async function getOrderCaptureKpis(): Promise<OrderCaptureKpis> {
  await ensureOrderCaptureTable();
  const manualEntryMinutesBaseline = 15;

  const row = await dbGet<{
    entry_minutes: number;
    entry_reduction_rate: number;
    order_accuracy: number;
    stp_rate: number;
    captured_orders: number;
  }>(`
    SELECT
      COALESCE(AVG(processing_seconds), 0) / 60.0 AS entry_minutes,
      CASE
        WHEN COALESCE(AVG(processing_seconds), 0) <= 0 THEN 0
        ELSE GREATEST(0, (${manualEntryMinutesBaseline} - (COALESCE(AVG(processing_seconds), 0) / 60.0)) / ${manualEntryMinutesBaseline})
      END AS entry_reduction_rate,
      COALESCE(AVG(extraction_confidence), 0) AS order_accuracy,
      CASE
        WHEN COUNT(*) = 0 THEN 0
        ELSE SUM(CASE WHEN requires_review = FALSE THEN 1 ELSE 0 END) * 1.0 / COUNT(*)
      END AS stp_rate,
      COUNT(*) AS captured_orders
    FROM order_capture_orders
  `);

  return {
    order_entry_time_reduction_rate: Number(row?.entry_reduction_rate ?? 0),
    order_accuracy: Number(row?.order_accuracy ?? 0),
    stp_rate: Number(row?.stp_rate ?? 0),
    captured_orders: Number(row?.captured_orders ?? 0),
  };
}

export async function logEvent(
  entityType: string,
  entityId: string,
  eventType: string,
  actor: string,
  payload: Record<string, unknown>,
) {
  await dbRun(`
    INSERT INTO event_log VALUES (
      '${randomUUID()}',
      '${escapeSqlString(entityType)}',
      '${escapeSqlString(entityId)}',
      '${escapeSqlString(eventType)}',
      '${escapeSqlString(actor)}',
      '${escapeSqlString(JSON.stringify(payload))}',
      '${randomUUID()}',
      now()
    )
  `);
}

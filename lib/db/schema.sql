CREATE TABLE IF NOT EXISTS customers (
  customer_id TEXT PRIMARY KEY,
  name TEXT,
  segment TEXT,
  credit_limit DOUBLE,
  payment_terms_days INTEGER,
  risk_score DOUBLE,
  created_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoices (
  invoice_id TEXT PRIMARY KEY,
  customer_id TEXT,
  invoice_date DATE,
  due_date DATE,
  amount_total DOUBLE,
  amount_open DOUBLE,
  status TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  payment_id TEXT PRIMARY KEY,
  customer_id TEXT,
  payment_date DATE,
  amount_total DOUBLE,
  amount_unapplied DOUBLE,
  payment_ref TEXT,
  remittance_text TEXT
);

CREATE TABLE IF NOT EXISTS allocations (
  allocation_id TEXT PRIMARY KEY,
  payment_id TEXT,
  invoice_id TEXT,
  allocated_amount DOUBLE,
  confidence DOUBLE,
  rationale TEXT,
  created_by TEXT,
  created_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS disputes (
  dispute_id TEXT PRIMARY KEY,
  invoice_id TEXT,
  customer_id TEXT,
  dispute_type TEXT,
  description TEXT,
  amount_at_risk DOUBLE,
  status TEXT,
  evidence_summary TEXT,
  created_at TIMESTAMP,
  resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS collections_actions (
  action_id TEXT PRIMARY KEY,
  customer_id TEXT,
  invoice_id TEXT,
  action_type TEXT,
  priority_score DOUBLE,
  recommended_message TEXT,
  status TEXT,
  created_by TEXT,
  created_at TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS event_log (
  event_id TEXT PRIMARY KEY,
  entity_type TEXT,
  entity_id TEXT,
  event_type TEXT,
  actor TEXT,
  payload_json TEXT,
  trace_id TEXT,
  created_at TIMESTAMP
);

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

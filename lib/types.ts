export type Customer = {
  customer_id: string;
  name: string;
  segment: string;
  credit_limit: number;
  payment_terms_days: number;
  risk_score: number;
  created_at: string;
};

export type Invoice = {
  invoice_id: string;
  customer_id: string;
  invoice_date: string;
  due_date: string;
  amount_total: number;
  amount_open: number;
  status: string;
  capture_id?: string | null;
  golden_tag?: string | null;
};

export type Payment = {
  payment_id: string;
  customer_id: string;
  payment_date: string;
  amount_total: number;
  amount_unapplied: number;
  payment_ref: string;
  remittance_text: string;
  capture_id?: string | null;
  golden_tag?: string | null;
};

export type Allocation = {
  allocation_id: string;
  payment_id: string;
  invoice_id: string;
  allocated_amount: number;
  confidence: number;
  rationale: string;
  created_by: string;
  created_at: string;
};

export type Dispute = {
  dispute_id: string;
  invoice_id: string;
  customer_id: string;
  dispute_type: string;
  description: string;
  amount_at_risk: number;
  status: string;
  evidence_summary: string;
  created_at: string;
  resolved_at: string | null;
  capture_id?: string | null;
  golden_tag?: string | null;
};

export type CollectionAction = {
  action_id: string;
  customer_id: string;
  invoice_id: string;
  action_type: string;
  priority_score: number;
  recommended_message: string;
  status: string;
  created_by: string;
  created_at: string;
  capture_id?: string | null;
  golden_tag?: string | null;
};

export type ContractSnapshot = {
  contract_snapshot_id: string;
  capture_id: string;
  customer_id: string;
  contract_id: string;
  effective_date: string;
  expiration_date: string;
  payment_terms_days: number;
  currency: string;
  total_amount: number;
  line_items_json: string;
  commercial_terms_json: string;
  source_summary: string;
  created_at: string;
};

export type Kpis = {
  auto_match_rate: number;
  unapplied_cash: number;
  dispute_rate: number;
  dso_proxy: number;
};

export type OrderCaptureSource = "email" | "chat";

export type OrderLineItem = {
  sku: string;
  quantity: number;
  unit_price: number;
};

export type CapturedOrder = {
  capture_id: string;
  source: OrderCaptureSource;
  customer_name: string;
  customer_email: string;
  po_number: string;
  requested_date: string;
  ship_to: string;
  currency: string;
  total_amount: number;
  line_items_json: string;
  extraction_confidence: number;
  requires_review: boolean;
  processing_seconds: number;
  created_by: string;
  created_at: string;
};

export type OrderCaptureKpis = {
  order_entry_time_reduction_rate: number;
  order_accuracy: number;
  stp_rate: number;
  captured_orders: number;
};

export type AgentKpiMetric = {
  key: string;
  label: string;
  value: number | null;
  unit: "percent" | "currency" | "days" | "minutes" | "count" | "ratio";
};

export type AgentKpiSummary = {
  agent_id: string;
  agent_name: string;
  stage: "implemented" | "planned";
  kpis: AgentKpiMetric[];
  primary_responsibilities: string[];
};

export type OrderJourneyTrace = {
  capture_id: string;
  customer_id: string;
  invoice_id: string | null;
  payment_id: string | null;
  collection_action_id: string | null;
  dispute_id: string | null;
  golden_tag: string | null;
  storyline: string;
  lifecycle_status: string;
  resolved_at: string | null;
};

export type OrderMailbox = {
  mailbox_id: string;
  display_name: string;
  address: string;
};

export type OrderMailboxMessage = {
  message_id: string;
  mailbox_id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  received_at: string;
  attachment: {
    file_name: string;
    public_url: string;
    content_type: string;
  };
};

export type OrderCaptureDraft = {
  customer_name: string;
  customer_email: string;
  po_number: string;
  requested_date: string;
  ship_to: string;
  currency: string;
  total_amount: number;
  line_items: OrderLineItem[];
  extraction_confidence: number;
  special_notes: string;
};

export type OrderCaptureCorrection = {
  field: string;
  from_value: string;
  to_value: string;
  reason: string;
};

export type OrderValidationDiscrepancy = {
  field: string;
  issue: string;
  severity: "low" | "medium" | "high";
  from_value: string;
  to_value: string;
  reason: string;
};

export type OrderValidationDraft = {
  customer_name: string;
  customer_email: string;
  po_number: string;
  requested_date: string;
  ship_to: string;
  currency: string;
  total_amount: number;
  line_items: OrderLineItem[];
};

export type OrderValidationResult = {
  capture_id: string;
  summary: string;
  recommendation: "accept" | "review" | "decline";
  original: OrderValidationDraft;
  proposed: OrderValidationDraft;
  discrepancies: OrderValidationDiscrepancy[];
};

export type EdiOrderAction = "accept" | "reject" | "hold";

export type EdiValidationIssue = {
  code: string;
  field: string;
  issue: string;
  severity: "low" | "medium" | "high";
  actual: string;
  expected: string;
  reason: string;
};

export type EdiOrderLine = {
  line_number: string;
  sku: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type EdiOrderRecord = {
  file_name: string;
  file_path: string;
  buyer_name: string;
  buyer_code: string;
  po_number: string;
  order_date: string;
  requested_date: string;
  ship_to: string;
  currency: string;
  total_amount: number;
  line_count: number;
  interchange_control_number: string;
  group_control_number: string;
  transaction_set_control_number: string;
  processed: boolean;
  processed_at: string | null;
  processing_outcome: "pass" | "fail" | null;
  action: EdiOrderAction | null;
  action_at: string | null;
  issues: EdiValidationIssue[];
  lines: EdiOrderLine[];
};

export type CreditRiskDecision = "approve" | "conditional" | "hold";

export type CreditRiskAssessment = {
  capture_id: string;
  risk_score: number;
  decision: CreditRiskDecision;
  rationale: string[];
  hold_reasons: string[];
  conditions: string[];
  recommendations: string[];
  metrics: {
    order_amount: number;
    credit_limit: number;
    open_ar: number;
    utilization_before: number;
    projected_utilization: number;
    open_exposure: number;
    customer_history_orders: number;
    customer_history_avg_order_value: number;
    disputes_open: number;
    dispute_rate: number;
    payment_behavior_score: number;
    avg_days_late: number;
    recent_order_velocity_count_30d: number;
    recent_order_velocity_value_30d: number;
    revenue_at_risk: number;
    bad_debt_delta: number;
  };
};

export type OrderValidationAction = {
  action_id: string;
  capture_id: string;
  action: "accept" | "reject" | "decline";
  actor: string;
  created_at: string;
};

export type CreditRiskAction = {
  action_id: string;
  capture_id: string;
  recommended_decision: "approve" | "conditional" | "hold";
  final_decision: "approve" | "conditional" | "hold" | "escalate";
  risk_score: number;
  revenue_at_risk: number;
  bad_debt_delta: number;
  rationale_json: string;
  override_reason: string;
  actor: string;
  created_at: string;
};

export type ValidatedOrder = CapturedOrder & {
  validation_action: "accept" | "reject" | "decline";
  validation_actor: string;
  validation_created_at: string;
};

export type CreditRatedOrder = CapturedOrder & {
  validation_action: "accept" | "reject" | "decline" | null;
  credit_recommended_decision: "approve" | "conditional" | "hold";
  credit_final_decision: "approve" | "conditional" | "hold" | "escalate";
  credit_risk_score: number;
  credit_revenue_at_risk: number;
  credit_bad_debt_delta: number;
  credit_action_created_at: string;
};

export type HoldResolutionDecision = "release" | "conditional_release" | "escalate";

export type HoldResolutionProposal = {
  capture_id: string;
  hold_reason_category: string;
  owner_team: string;
  recommended_decision: HoldResolutionDecision;
  expected_time_to_release_hours: number;
  required_actions: string[];
  release_conditions: string[];
  customer_message: string;
  internal_note: string;
};

export type HeldOrder = CreditRatedOrder & {
  hold_reasons: string[];
};

export type InventoryPosition = {
  inventory_id: string;
  sku: string;
  location: string;
  on_hand_qty: number;
  reserved_qty: number;
  available_qty: number;
  inbound_qty: number;
  next_inbound_date: string | null;
  updated_at: string;
};

export type AllocationEligibleOrder = CreditRatedOrder & {
  allocation_release_status: "approve" | "conditional" | "release" | "conditional_release";
};

export type InventoryAllocationDecision =
  | "allocate_full"
  | "allocate_partial"
  | "substitute"
  | "split_shipment"
  | "backorder"
  | "escalate";

export type InventoryAllocationLineResult = {
  sku: string;
  ordered_qty: number;
  allocated_qty: number;
  backordered_qty: number;
  status: "allocated" | "partial" | "substituted" | "backordered" | "escalated";
  source_location: string | null;
  substitute_sku: string | null;
  proposed_ship_date: string | null;
  rationale: string;
};

export type InventoryAllocationProposal = {
  capture_id: string;
  decision: InventoryAllocationDecision;
  summary: string;
  fill_rate: number;
  revenue_at_risk: number;
  lines: InventoryAllocationLineResult[];
  recommended_actions: string[];
  escalation_reason: string | null;
};

export type InventoryAllocationAction = {
  action_id: string;
  capture_id: string;
  recommended_decision: InventoryAllocationDecision;
  final_decision: InventoryAllocationDecision | "accepted";
  fill_rate: number;
  revenue_at_risk: number;
  summary: string;
  line_results_json: string;
  actor: string;
  created_at: string;
};

export type WorkflowAgentAction = {
  action_id: string;
  agent_id: string;
  subject_type: string;
  subject_id: string;
  recommended_decision: string;
  final_decision: string;
  summary: string;
  payload_json: string;
  actor: string;
  created_at: string;
};

export type AgentInsight = {
  insight_id: string;
  agent_id: string;
  insight_type: string;
  subject_id: string;
  severity: "low" | "medium" | "high";
  title: string;
  summary: string;
  payload_json: string;
  actor: string;
  created_at: string;
};

export type ShipmentPlanningProposal = {
  capture_id: string;
  plan_status: "scheduled" | "split_required" | "capacity_risk" | "manual_review";
  ship_from: string[];
  planned_ship_date: string | null;
  estimated_delivery_date: string | null;
  carrier_strategy: string;
  milestones: string[];
  summary: string;
};

export type BillingIntelligenceProposal = {
  capture_id: string;
  billing_status: "ready_to_invoice" | "hold_for_review" | "missing_prerequisite";
  invoice_amount: number;
  billing_date: string | null;
  anomalies: string[];
  summary: string;
};

export type InvoiceMatchingProposal = {
  invoice_id: string;
  match_status: "matched" | "variance_detected" | "investigate";
  variance_amount: number;
  reasons: string[];
  summary: string;
};

export type PaymentPredictionProposal = {
  customer_id: string;
  predicted_payment_date: string;
  late_risk: "low" | "medium" | "high";
  confidence: number;
  rationale: string[];
};

export type CollectionsCommunicationProposal = {
  action_id: string;
  channel: "email" | "phone" | "portal";
  subject_line: string;
  message: string;
  tone: "firm" | "neutral" | "relationship";
  next_step: string;
};

export type ReviewFact = {
  label: string;
  value: string;
};

export type ReviewAgentResult = {
  subject_id: string;
  action_title: string;
  action_summary: string;
  recommended_decision: string;
  facts: ReviewFact[];
  insights: string[];
  payload: Record<string, unknown>;
};

export type CollectionsStrategyQueueRow = {
  invoice_id: string;
  capture_id: string | null;
  customer_id: string;
  customer_name: string;
  due_date: string;
  amount_total: number;
  amount_open: number;
  days_past_due: number;
  risk_score: number;
  golden_tag?: string | null;
};

export type CashApplicationQueueCustomer = {
  customer_id: string;
  customer_name: string;
  unapplied_payment_count: number;
  open_invoice_count: number;
  unapplied_cash_total: number;
  open_ar_total: number;
};

export type WorkingCapitalInsight = {
  insight_type: "dso" | "aging_mix" | "collections" | "disputes";
  severity: "low" | "medium" | "high";
  title: string;
  summary: string;
  metric_value: number;
  recommendation: string;
};

export type ProcessMiningInsight = {
  bottleneck_stage: string;
  severity: "low" | "medium" | "high";
  summary: string;
  impacted_records: number;
  recommendation: string;
};

export type ComplianceAuditFinding = {
  control_area: string;
  severity: "low" | "medium" | "high";
  summary: string;
  impacted_records: number;
  recommendation: string;
};

export type OrchestratorRecommendation = {
  work_item_type: "order" | "invoice" | "payment" | "dispute" | "collection";
  entity_id: string;
  next_agent: string;
  priority: "low" | "medium" | "high";
  summary: string;
};

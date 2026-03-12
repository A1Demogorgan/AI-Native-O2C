export type AgentDefinition = {
  id: string;
  name: string;
  kpiLabels: string[];
  primaryResponsibilities: string[];
};

export const AGENT_CATALOG: AgentDefinition[] = [
  {
    id: "o2c-orchestrator",
    name: "O2C Orchestrator Agent",
    kpiLabels: ["Order cycle time", "Exception rate", "SLA adherence"],
    primaryResponsibilities: ["Event-driven routing", "Step gating", "Retries and escalations", "Workload balancing"],
  },
  {
    id: "order-capture",
    name: "Order Capture Agent",
    kpiLabels: ["Order entry time", "Order accuracy", "STP rate"],
    primaryResponsibilities: [
      "Extract and normalize orders from email/voice/chat",
      "Map to ERP fields",
      "Validate required data",
    ],
  },
  {
    id: "order-capture-edi",
    name: "Order Capture - EDI",
    kpiLabels: ["EDI orders processed", "EDI pass rate", "EDI exception rate"],
    primaryResponsibilities: [
      "Parse X12 850 purchase orders",
      "Validate structure and business rules",
      "Route accepted, rejected, and held orders",
    ],
  },
  {
    id: "order-validation",
    name: "Order Validation Agent",
    kpiLabels: ["Order error rate", "Pricing accuracy", "Fulfillment accuracy"],
    primaryResponsibilities: ["Enforce pricing/contract rules", "Check inventory and terms", "Flag exceptions with reasons"],
  },
  {
    id: "credit-risk",
    name: "Credit Risk Agent",
    kpiLabels: ["Bad debt %", "Credit approval time", "Revenue at risk"],
    primaryResponsibilities: ["Risk scoring", "Approve/hold recommendation", "Policy-based justification"],
  },
  {
    id: "hold-resolution",
    name: "Hold Resolution Agent",
    kpiLabels: ["Hold duration", "Revenue delay", "Manual touches"],
    primaryResponsibilities: [
      "Diagnose hold reasons",
      "Recommend cures",
      "Auto-release under thresholds with approvals",
    ],
  },
  {
    id: "inventory-allocation",
    name: "Inventory & Allocation Agent",
    kpiLabels: ["Fill rate", "Stockout rate", "Backorder age"],
    primaryResponsibilities: ["Allocate stock", "Propose substitutions", "Trigger replenishment signals"],
  },
  {
    id: "shipment-planning",
    name: "Shipment Planning Agent",
    kpiLabels: ["On-time delivery", "Freight cost/order", "Delivery SLA hits"],
    primaryResponsibilities: ["Carrier selection", "Schedule optimization", "Exception alerts"],
  },
  {
    id: "billing-intelligence",
    name: "Billing Intelligence Agent",
    kpiLabels: ["Invoice cycle time", "Invoice accuracy", "Leakage rate"],
    primaryResponsibilities: ["Invoice generation", "Tax/price validation", "Anomaly detection"],
  },
  {
    id: "invoice-matching",
    name: "Invoice Matching Agent",
    kpiLabels: ["Dispute rate", "Billing error rate", "Rework %"],
    primaryResponsibilities: ["3-way match (PO/Delivery/Invoice)", "Prevent incorrect invoices"],
  },
  {
    id: "payment-prediction",
    name: "Payment Prediction Agent",
    kpiLabels: ["Cash forecast accuracy", "Late-pay rate"],
    primaryResponsibilities: ["Predict payment date", "Predict late risk", "Trigger proactive actions"],
  },
  {
    id: "cash-application",
    name: "Cash Application Agent",
    kpiLabels: ["Auto-match rate", "Unapplied cash", "Cost per payment"],
    primaryResponsibilities: [
      "Remittance extraction",
      "Probabilistic matching",
      "Allocation recommendations",
    ],
  },
  {
    id: "collections-strategy",
    name: "Collections Strategy Agent",
    kpiLabels: ["DSO", "CEI", "Promise-to-pay kept rate"],
    primaryResponsibilities: ["Prioritize worklist", "Select channel/time", "Recommend negotiation offers"],
  },
  {
    id: "collections-communications",
    name: "Collections Communications Agent",
    kpiLabels: ["Contact-to-payment conversion", "Response rate"],
    primaryResponsibilities: ["Generate compliant outreach", "Manage sequences", "Log outcomes"],
  },
  {
    id: "dispute-triage-resolution",
    name: "Dispute Triage & Resolution Agent",
    kpiLabels: ["Dispute resolution time", "Amount at risk", "Reopen rate"],
    primaryResponsibilities: ["Classify disputes", "Assemble evidence pack", "Recommend next action"],
  },
  {
    id: "working-capital-intelligence",
    name: "Working Capital Intelligence Agent",
    kpiLabels: ["DSO", "CCC", "Aging mix improvement"],
    primaryResponsibilities: ["Detect structural issues", "Segment customers", "Propose policy changes"],
  },
  {
    id: "process-mining",
    name: "Process Mining Agent",
    kpiLabels: ["Automation rate", "Cycle time", "Bottleneck rate"],
    primaryResponsibilities: ["Analyze event logs", "Identify variance", "Recommend process redesign"],
  },
  {
    id: "compliance-audit",
    name: "Compliance & Audit Agent",
    kpiLabels: ["Audit findings", "Policy adherence", "Control breaches"],
    primaryResponsibilities: ["Continuous controls monitoring", "Anomaly flags", "Audit-ready trails"],
  },
];

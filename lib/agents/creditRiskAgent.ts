import { z } from "zod";
import { runWithAgentSdkStrict } from "@/lib/agents/sdk";
import type { CapturedOrder, CreditRiskAssessment, CreditRiskDecision } from "@/lib/types";

const customerRiskMaster: Record<
  string,
  {
    customer_name: string;
    credit_limit: number;
    open_ar: number;
    disputes_open: number;
    avg_days_late: number;
    payment_behavior_score: number;
    dispute_rate: number;
    risk_baseline: number;
    blacklisted: boolean;
  }
> = {
  "procurement@harborviewsuites.com": {
    customer_name: "HarborView Suites Boston",
    credit_limit: 350000,
    open_ar: 98000,
    disputes_open: 1,
    avg_days_late: 4,
    payment_behavior_score: 0.18,
    dispute_rate: 0.03,
    risk_baseline: 0.22,
    blacklisted: false,
  },
  "supplychain@lotushospitalitygroup.com": {
    customer_name: "Lotus Riverside Chicago",
    credit_limit: 280000,
    open_ar: 162000,
    disputes_open: 3,
    avg_days_late: 8,
    payment_behavior_score: 0.31,
    dispute_rate: 0.06,
    risk_baseline: 0.34,
    blacklisted: false,
  },
  "opsbuying@sunsetresortcollection.com": {
    customer_name: "Sunset Resort Las Vegas",
    credit_limit: 420000,
    open_ar: 201000,
    disputes_open: 2,
    avg_days_late: 6,
    payment_behavior_score: 0.28,
    dispute_rate: 0.05,
    risk_baseline: 0.29,
    blacklisted: false,
  },
  "orders@beaconharbormiami.com": {
    customer_name: "Beacon Harbor Hotel Miami",
    credit_limit: 160000,
    open_ar: 139000,
    disputes_open: 6,
    avg_days_late: 19,
    payment_behavior_score: 0.63,
    dispute_rate: 0.12,
    risk_baseline: 0.51,
    blacklisted: false,
  },
  "purchasing@blacklisted-demo.com": {
    customer_name: "Blacklisted Demo Holdings",
    credit_limit: 50000,
    open_ar: 76000,
    disputes_open: 11,
    avg_days_late: 35,
    payment_behavior_score: 0.98,
    dispute_rate: 0.32,
    risk_baseline: 0.95,
    blacklisted: true,
  },
};

const outputSchema = z.object({
  rationale: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  conditions: z.array(z.string()).default([]),
});

function parseAgentJson(raw: string) {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fence ? fence[1].trim() : trimmed);
}

function getCustomerRisk(order: CapturedOrder) {
  return (
    customerRiskMaster[order.customer_email.toLowerCase()] ?? {
      customer_name: order.customer_name,
      credit_limit: 120000,
      open_ar: 62000,
      disputes_open: 2,
      avg_days_late: 10,
      payment_behavior_score: 0.45,
      dispute_rate: 0.08,
      risk_baseline: 0.45,
      blacklisted: false,
    }
  );
}

function customerOrderHistory(customerEmail: string, allOrders: CapturedOrder[]) {
  const items = allOrders.filter((o) => o.customer_email.toLowerCase() === customerEmail.toLowerCase());
  const count = items.length;
  const total = items.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const avg = count === 0 ? 0 : total / count;

  const now = Date.now();
  const days30 = 30 * 24 * 60 * 60 * 1000;
  const recent = items.filter((o) => now - new Date(o.created_at).getTime() <= days30);
  const recentCount = recent.length;
  const recentValue = recent.reduce((sum, o) => sum + Number(o.total_amount), 0);

  return {
    count,
    avg_order_value: avg,
    recent_count_30d: recentCount,
    recent_value_30d: recentValue,
  };
}

function deterministicAssessment(order: CapturedOrder, contextOrders: CapturedOrder[]): CreditRiskAssessment {
  const customer = getCustomerRisk(order);
  const orderAmount = Number(order.total_amount);
  const history = customerOrderHistory(order.customer_email, contextOrders);
  const utilizationBefore = customer.open_ar / Math.max(customer.credit_limit, 1);
  const projectedUtilization = (customer.open_ar + orderAmount) / Math.max(customer.credit_limit, 1);
  const openExposure = customer.open_ar + history.recent_value_30d * 0.35;

  let risk = 100 * (
    customer.risk_baseline * 0.32 +
    Math.min(1.4, projectedUtilization) / 1.4 * 0.28 +
    Math.min(1, customer.dispute_rate * 2.2) * 0.12 +
    Math.min(1, customer.avg_days_late / 40) * 0.12 +
    Math.min(1, customer.payment_behavior_score) * 0.1 +
    Math.min(1, history.recent_count_30d / 8) * 0.06
  );
  if (customer.blacklisted) risk = 99;
  risk = Math.max(0, Math.min(99, Number(risk.toFixed(1))));

  const holdReasons: string[] = [];
  if (customer.blacklisted) holdReasons.push("Customer is blacklisted by policy");
  if (projectedUtilization > 1.15) holdReasons.push("Projected utilization exceeds 115% of credit limit");
  if (customer.disputes_open >= 6) holdReasons.push("High open dispute count");
  if (customer.avg_days_late >= 25) holdReasons.push("Severe late-payment behavior");
  if (customer.payment_behavior_score >= 0.85) holdReasons.push("Critical payment behavior risk score");

  let decision: CreditRiskDecision = "approve";
  const conditions: string[] = [];
  if (holdReasons.length > 0 || risk >= 84) {
    decision = "hold";
  } else if (risk >= 62 || projectedUtilization > 0.9 || customer.disputes_open >= 3) {
    decision = "conditional";
    conditions.push("30% prepayment");
    conditions.push("Credit controller approval prior to release");
    conditions.push("Shipment in controlled tranches");
  }

  const revenueAtRisk = Number((orderAmount * (risk / 100) * 0.5).toFixed(2));
  const badDebtDelta = Number((orderAmount * (risk / 100) * 0.11).toFixed(2));

  const rationale = [
    `Open AR ${customer.open_ar.toFixed(2)} against credit limit ${customer.credit_limit.toFixed(2)}`,
    `Utilization moves from ${(utilizationBefore * 100).toFixed(1)}% to ${(projectedUtilization * 100).toFixed(1)}% with this order`,
    `Disputes open: ${customer.disputes_open}; avg days late: ${customer.avg_days_late}; payment behavior score: ${customer.payment_behavior_score.toFixed(2)}`,
    `Recent order velocity (30d): ${history.recent_count_30d} orders worth ${history.recent_value_30d.toFixed(2)}`,
  ];
  if (holdReasons.length > 0) {
    rationale.push(`Hold triggers: ${holdReasons.join("; ")}`);
  }

  const recommendations = [
    decision === "approve" ? "Proceed with standard release" : "Apply mitigations before release",
    decision === "hold" ? "Escalate to credit committee with supporting documents" : "Continue monitoring utilization and collections actions",
  ];

  return {
    capture_id: order.capture_id,
    risk_score: risk,
    decision,
    hold_reasons: holdReasons,
    rationale,
    recommendations,
    conditions,
    metrics: {
      order_amount: Number(orderAmount.toFixed(2)),
      credit_limit: Number(customer.credit_limit.toFixed(2)),
      open_ar: Number(customer.open_ar.toFixed(2)),
      utilization_before: Number(utilizationBefore.toFixed(3)),
      projected_utilization: Number(projectedUtilization.toFixed(3)),
      open_exposure: Number(openExposure.toFixed(2)),
      customer_history_orders: history.count,
      customer_history_avg_order_value: Number(history.avg_order_value.toFixed(2)),
      disputes_open: customer.disputes_open,
      dispute_rate: Number(customer.dispute_rate.toFixed(3)),
      payment_behavior_score: Number(customer.payment_behavior_score.toFixed(3)),
      avg_days_late: customer.avg_days_late,
      recent_order_velocity_count_30d: history.recent_count_30d,
      recent_order_velocity_value_30d: Number(history.recent_value_30d.toFixed(2)),
      revenue_at_risk: revenueAtRisk,
      bad_debt_delta: badDebtDelta,
    },
  };
}

async function refineNarrativeWithAgent(base: CreditRiskAssessment, order: CapturedOrder): Promise<CreditRiskAssessment> {
  const systemPrompt = [
    "You are a Credit Risk Agent for O2C.",
    "Given fixed risk metrics and fixed decision, improve only narrative fields:",
    "rationale, conditions, recommendations.",
    "Do not change decision or metrics.",
    "Return ONLY JSON keys: rationale, conditions, recommendations.",
  ].join(" ");

  const raw = await runWithAgentSdkStrict(
    systemPrompt,
    JSON.stringify({
      order,
      baseline: base,
      fixed_decision: base.decision,
    }),
  );
  const parsed = outputSchema.parse(parseAgentJson(raw));
  return {
    ...base,
    rationale: parsed.rationale.length > 0 ? parsed.rationale : base.rationale,
    conditions: parsed.conditions.length > 0 ? parsed.conditions : base.conditions,
    recommendations: parsed.recommendations.length > 0 ? parsed.recommendations : base.recommendations,
  };
}

export async function runCreditRiskForSingle(order: CapturedOrder, contextOrders: CapturedOrder[]): Promise<CreditRiskAssessment> {
  const base = deterministicAssessment(order, contextOrders);
  try {
    return await refineNarrativeWithAgent(base, order);
  } catch {
    return base;
  }
}

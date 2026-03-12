import { z } from "zod";
import { runWithAgentSdkStrict } from "@/lib/agents/sdk";
import type {
  CapturedOrder,
  OrderLineItem,
  OrderValidationDiscrepancy,
  OrderValidationDraft,
  OrderValidationResult,
} from "@/lib/types";

const skuAliases: Record<string, string> = {
  "HTL-KING-PLUSH-V1": "HTL-KING-PLUSH",
  "HTL-QUEEN-FIRM-OLD": "HTL-QUEEN-FIRM",
  "HTL-KING-HYBRID-2024": "HTL-KING-HYBRID",
  "HTL-TWIN-FIRM-LEGACY": "HTL-TWIN-FIRM",
  "HTL-CAL-KING-PREMIUM-X": "HTL-CAL-KING-PREMIUM",
  "HTL-QUEEN-PREMIUM-X": "HTL-QUEEN-PREMIUM",
};

const customerByEmail: Record<string, string> = {
  "procurement@harborviewsuites.com": "HarborView Suites Boston",
  "supplychain@lotushospitalitygroup.com": "Lotus Riverside Chicago",
  "opsbuying@sunsetresortcollection.com": "Sunset Resort Las Vegas",
};

const blacklist = new Set(["purchasing@blacklisted-demo.com", "blacklisted demo holdings"]);

const skuRules: Record<string, { moq: number; contract_price: number; lead_time_days: number }> = {
  "HTL-KING-PLUSH": { moq: 10, contract_price: 281, lead_time_days: 10 },
  "HTL-QUEEN-FIRM": { moq: 10, contract_price: 233, lead_time_days: 8 },
  "HTL-KING-HYBRID": { moq: 8, contract_price: 321, lead_time_days: 12 },
  "HTL-TWIN-FIRM": { moq: 12, contract_price: 171, lead_time_days: 7 },
  "HTL-CAL-KING-PREMIUM": { moq: 6, contract_price: 349, lead_time_days: 14 },
  "HTL-QUEEN-PREMIUM": { moq: 8, contract_price: 291, lead_time_days: 11 },
};

const discrepancySchema = z.object({
  field: z.string(),
  issue: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  from_value: z.string(),
  to_value: z.string(),
  reason: z.string(),
});

const lineItemSchema = z.object({
  sku: z.string(),
  quantity: z.number(),
  unit_price: z.number(),
});

const draftSchema = z.object({
  customer_name: z.string(),
  customer_email: z.string(),
  po_number: z.string(),
  requested_date: z.string(),
  ship_to: z.string(),
  currency: z.string(),
  total_amount: z.number(),
  line_items: z.array(lineItemSchema),
});

const outputSchema = z.object({
  summary: z.string(),
  recommendation: z.enum(["accept", "review", "decline"]),
  proposed: draftSchema,
  discrepancies: z.array(discrepancySchema),
});

function parseLineItems(raw: string): OrderLineItem[] {
  try {
    const parsed = JSON.parse(raw) as OrderLineItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toDraft(order: CapturedOrder): OrderValidationDraft {
  return {
    customer_name: order.customer_name,
    customer_email: order.customer_email,
    po_number: order.po_number,
    requested_date: order.requested_date,
    ship_to: order.ship_to,
    currency: order.currency,
    total_amount: Number(order.total_amount),
    line_items: parseLineItems(order.line_items_json),
  };
}

function calcHistoricalAvgLeadDays(orders: CapturedOrder[]) {
  const leads = orders
    .map((o) => {
      const created = new Date(o.created_at).getTime();
      const requested = new Date(o.requested_date).getTime();
      if (!Number.isFinite(created) || !Number.isFinite(requested)) return null;
      return (requested - created) / (24 * 60 * 60 * 1000);
    })
    .filter((d): d is number => d !== null && d >= 0);
  if (leads.length === 0) return 10;
  return leads.reduce((a, b) => a + b, 0) / leads.length;
}

function deterministicBaseline(
  order: CapturedOrder,
  historicalAvgLeadDays: number,
): { proposed: OrderValidationDraft; discrepancies: OrderValidationDiscrepancy[]; recommendation: "accept" | "review" | "decline" } {
  const original = toDraft(order);
  const proposed: OrderValidationDraft = {
    ...original,
    line_items: original.line_items.map((x) => ({ ...x })),
  };
  const discrepancies: OrderValidationDiscrepancy[] = [];
  let recommendation: "accept" | "review" | "decline" = "accept";

  const emailKey = original.customer_email.toLowerCase();
  const expectedCustomer = customerByEmail[emailKey];
  if (expectedCustomer && expectedCustomer !== original.customer_name) {
    discrepancies.push({
      field: "customer_name",
      issue: "Customer master mismatch",
      severity: "high",
      from_value: original.customer_name,
      to_value: expectedCustomer,
      reason: "Mapped customer from sender/customer email master data",
    });
    proposed.customer_name = expectedCustomer;
    recommendation = "review";
  }

  if (blacklist.has(emailKey) || blacklist.has(original.customer_name.toLowerCase())) {
    discrepancies.push({
      field: "customer_email",
      issue: "Blacklisted customer",
      severity: "high",
      from_value: original.customer_email,
      to_value: original.customer_email,
      reason: "Customer is in the blacklist policy",
    });
    recommendation = "decline";
  }

  proposed.line_items = proposed.line_items.map((item, idx) => {
    const next = { ...item };
    const normalizedSku = skuAliases[item.sku] ?? item.sku;
    if (normalizedSku !== item.sku) {
      discrepancies.push({
        field: `line_items[${idx}].sku`,
        issue: "Legacy SKU alias",
        severity: "medium",
        from_value: item.sku,
        to_value: normalizedSku,
        reason: "Mapped legacy SKU to current catalog SKU",
      });
      next.sku = normalizedSku;
      recommendation = recommendation === "accept" ? "review" : recommendation;
    }

    const rule = skuRules[next.sku];
    if (rule) {
      if (next.quantity < rule.moq) {
        discrepancies.push({
          field: `line_items[${idx}].quantity`,
          issue: "MOQ mismatch",
          severity: "high",
          from_value: String(next.quantity),
          to_value: String(rule.moq),
          reason: `Minimum order quantity for ${next.sku} is ${rule.moq}`,
        });
        next.quantity = rule.moq;
        recommendation = "review";
      }

      if (Math.abs(next.unit_price - rule.contract_price) > 0.001) {
        discrepancies.push({
          field: `line_items[${idx}].unit_price`,
          issue: "Contract price mismatch",
          severity: "high",
          from_value: String(next.unit_price),
          to_value: String(rule.contract_price),
          reason: `Applied contracted unit price clause for ${next.sku}`,
        });
        next.unit_price = rule.contract_price;
        recommendation = "review";
      }
    }

    return next;
  });

  const minLead = proposed.line_items.reduce((maxLead, item) => {
    const rule = skuRules[item.sku];
    return Math.max(maxLead, rule?.lead_time_days ?? 7);
  }, 7);
  const requestedLead = Math.floor(
    (new Date(proposed.requested_date).getTime() - new Date(order.created_at).getTime()) / (24 * 60 * 60 * 1000),
  );
  const baselineLead = Math.max(Math.round(historicalAvgLeadDays), minLead);
  if (requestedLead >= 0 && requestedLead < baselineLead) {
    const fixedDate = new Date(order.created_at);
    fixedDate.setDate(fixedDate.getDate() + baselineLead);
    const correctedDate = fixedDate.toISOString().slice(0, 10);
    discrepancies.push({
      field: "requested_date",
      issue: "Delivery timeline too short",
      severity: "medium",
      from_value: proposed.requested_date,
      to_value: correctedDate,
      reason: `Adjusted using historical average lead time (${Math.round(historicalAvgLeadDays)} days) and SKU lead constraints`,
    });
    proposed.requested_date = correctedDate;
    recommendation = recommendation === "accept" ? "review" : recommendation;
  }

  proposed.total_amount = Number(
    proposed.line_items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0).toFixed(2),
  );

  return { proposed, discrepancies, recommendation };
}

function parseAgentJson(raw: string) {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fence ? fence[1].trim() : trimmed);
}

async function refineWithAgent(input: {
  order: CapturedOrder;
  baseline: ReturnType<typeof deterministicBaseline>;
  historical_avg_lead_days: number;
}): Promise<OrderValidationResult> {
  const original = toDraft(input.order);
  const systemPrompt = [
    "You are an Order Validation Agent for hospitality mattress orders.",
    "Validate order against contract clauses, customer master, SKU master, MOQ, timeline feasibility, and blacklist.",
    "You may refine baseline corrections, but keep only realistic changes with explicit reasons.",
    "Return ONLY JSON with keys: summary, recommendation, proposed, discrepancies.",
    "recommendation must be one of: accept, review, decline.",
    "discrepancies items: field, issue, severity(low|medium|high), from_value, to_value, reason.",
    "Do not output markdown.",
  ].join(" ");

  const raw = await runWithAgentSdkStrict(
    systemPrompt,
    JSON.stringify({
      original_order: original,
      baseline: input.baseline,
      historical_avg_lead_days: input.historical_avg_lead_days,
      sku_rules: skuRules,
      sku_aliases: skuAliases,
      customer_by_email: customerByEmail,
      blacklist: Array.from(blacklist),
    }),
  );

  const parsed = outputSchema.parse(parseAgentJson(raw));
  return {
    capture_id: input.order.capture_id,
    summary: parsed.summary,
    recommendation: parsed.recommendation,
    original,
    proposed: parsed.proposed,
    discrepancies: parsed.discrepancies,
  };
}

export async function runOrderValidationAgent(orders: CapturedOrder[]): Promise<OrderValidationResult[]> {
  const historicalAvg = calcHistoricalAvgLeadDays(orders);
  const results: OrderValidationResult[] = [];

  for (const order of orders) {
    const single = await runOrderValidationAgentForSingle(order, historicalAvg);
    results.push(single);
  }

  return results;
}

export async function runOrderValidationAgentForSingle(
  order: CapturedOrder,
  historicalAvgLeadDays: number,
): Promise<OrderValidationResult> {
  const baseline = deterministicBaseline(order, historicalAvgLeadDays);
  try {
    const refined = await refineWithAgent({
      order,
      baseline,
      historical_avg_lead_days: historicalAvgLeadDays,
    });
    return refined;
  } catch {
    return {
      capture_id: order.capture_id,
      summary:
        baseline.discrepancies.length === 0
          ? "No material discrepancies found."
          : `Detected ${baseline.discrepancies.length} discrepancy(s) by validation rules.`,
      recommendation: baseline.recommendation,
      original: toDraft(order),
      proposed: baseline.proposed,
      discrepancies: baseline.discrepancies,
    };
  }
}

export function getHistoricalAverageLeadDays(orders: CapturedOrder[]) {
  return calcHistoricalAvgLeadDays(orders);
}

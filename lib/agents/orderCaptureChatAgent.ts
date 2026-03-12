import { z } from "zod";
import { runWithAgentSdkStrict } from "@/lib/agents/sdk";
import { getOrderCaptureMasterData } from "@/lib/order-capture-fixtures/masterData";
import type { OrderCaptureDraft } from "@/lib/types";

export type ChatProfile = {
  user_name: string;
  user_email: string;
  customer_name: string;
  customer_email: string;
  customer_id: string;
  ship_to_default: string;
  currency: string;
};

export type ChatTurnInput = {
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  draft: Partial<OrderCaptureDraft>;
  profile: ChatProfile;
};

type PricingQuote = {
  sku: string;
  unit_price: number;
  currency: string;
  contract_clause: string;
  contract_link: string;
};

const skuGuide = [
  {
    sku: "HTL-KING-PLUSH",
    comfort_level: "Plush",
    price_band: "Premium",
    list_price: 289,
    moq: 10,
    lead_time_days: 10,
    lifetime_years: 8,
    warranty_years: 5,
    quality_standards: "Hospitality fire-safety compliant, edge support",
    customer_feedback: "High guest comfort scores for luxury suites",
    recommended_for: "Luxury king rooms with softer sleep profile",
  },
  {
    sku: "HTL-QUEEN-FIRM",
    comfort_level: "Firm",
    price_band: "Standard",
    list_price: 239,
    moq: 10,
    lead_time_days: 8,
    lifetime_years: 7,
    warranty_years: 5,
    quality_standards: "High-durability foam layers for high turnover",
    customer_feedback: "Strong durability and low replacement frequency",
    recommended_for: "Business hotels and standard queen inventory",
  },
  {
    sku: "HTL-KING-HYBRID",
    comfort_level: "Medium-firm",
    price_band: "Premium",
    list_price: 329,
    moq: 8,
    lead_time_days: 12,
    lifetime_years: 9,
    warranty_years: 6,
    quality_standards: "Hybrid spring + foam, long-life support core",
    customer_feedback: "Very good motion isolation and comfort balance",
    recommended_for: "Upscale suites and extended-stay properties",
  },
  {
    sku: "HTL-TWIN-FIRM",
    comfort_level: "Firm",
    price_band: "Value",
    list_price: 179,
    moq: 12,
    lead_time_days: 7,
    lifetime_years: 6,
    warranty_years: 4,
    quality_standards: "Commercial-grade fabric and reinforced seams",
    customer_feedback: "Reliable for high-turnover rooms and staff housing",
    recommended_for: "Staff housing, twin occupancy, budget properties",
  },
  {
    sku: "HTL-CAL-KING-PREMIUM",
    comfort_level: "Medium-plush",
    price_band: "Premium",
    list_price: 359,
    moq: 6,
    lead_time_days: 14,
    lifetime_years: 9,
    warranty_years: 6,
    quality_standards: "Premium top panel and motion isolation",
    customer_feedback: "Excellent satisfaction for executive inventory",
    recommended_for: "Executive rooms and premium cal-king layouts",
  },
  {
    sku: "HTL-QUEEN-PREMIUM",
    comfort_level: "Medium",
    price_band: "Premium",
    list_price: 299,
    moq: 8,
    lead_time_days: 11,
    lifetime_years: 8,
    warranty_years: 5,
    quality_standards: "Extended warranty grade, high density comfort layers",
    customer_feedback: "Preferred in renovation upgrades and premium floors",
    recommended_for: "Renovation projects needing premium queen experience",
  },
];

const contractPricesByCustomerEmail: Record<string, Record<string, number>> = {
  "procurement@harborviewsuites.com": {
    "HTL-KING-PLUSH": 281,
    "HTL-QUEEN-FIRM": 233,
    "HTL-KING-HYBRID": 321,
    "HTL-TWIN-FIRM": 171,
    "HTL-CAL-KING-PREMIUM": 349,
    "HTL-QUEEN-PREMIUM": 291,
  },
  "supplychain@lotushospitalitygroup.com": {
    "HTL-KING-PLUSH": 283,
    "HTL-QUEEN-FIRM": 234,
    "HTL-KING-HYBRID": 323,
    "HTL-TWIN-FIRM": 172,
    "HTL-CAL-KING-PREMIUM": 351,
    "HTL-QUEEN-PREMIUM": 292,
  },
  "opsbuying@sunsetresortcollection.com": {
    "HTL-KING-PLUSH": 286,
    "HTL-QUEEN-FIRM": 236,
    "HTL-KING-HYBRID": 325,
    "HTL-TWIN-FIRM": 173,
    "HTL-CAL-KING-PREMIUM": 353,
    "HTL-QUEEN-PREMIUM": 294,
  },
};

const lineItemSchema = z.object({
  sku: z.string().nullish().default(""),
  quantity: z.number().nullish().default(0),
  unit_price: z.number().nullish().default(0),
});

const partialDraftSchema = z.object({
  customer_name: z.string().nullish().optional(),
  customer_email: z.string().nullish().optional(),
  po_number: z.string().nullish().optional(),
  requested_date: z.string().nullish().optional(),
  ship_to: z.string().nullish().optional(),
  currency: z.string().nullish().optional(),
  total_amount: z.number().nullish().optional(),
  extraction_confidence: z.number().min(0).max(1).nullish().optional(),
  special_notes: z.string().nullish().optional(),
  line_items: z.array(lineItemSchema).optional(),
});

const responseSchema = z.object({
  assistant_message: z.string().min(1),
  guardrail_blocked: z.boolean(),
  guardrail_reason: z.string().nullish().default(""),
  order_draft: partialDraftSchema.default({}),
  missing_fields: z.array(z.string()).default([]),
  ready_to_post: z.boolean(),
  suggested_skus: z
    .array(
      z.union([
        z.string(),
        z.object({
          sku: z.string().default(""),
          comfort_level: z.string().default(""),
          price_band: z.string().default(""),
          moq: z.number().default(0),
          lead_time_days: z.number().default(0),
          quality_standards: z.string().default(""),
          recommended_for: z.string().default(""),
        }),
      ]),
    )
    .default([]),
});

function parseJsonObject(raw: string) {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  return JSON.parse(candidate);
}

function mergeDraft(base: Partial<OrderCaptureDraft>, next: Partial<OrderCaptureDraft>) {
  const merged: Partial<OrderCaptureDraft> = {
    ...base,
    ...next,
  };
  if (base.line_items || next.line_items) {
    merged.line_items = next.line_items ?? base.line_items ?? [];
  }
  return merged;
}

function normalizePartialDraft(draft: z.infer<typeof partialDraftSchema>): Partial<OrderCaptureDraft> {
  const normalizedLineItems = (draft.line_items ?? [])
    .map((item) => ({
      sku: (item.sku ?? "").trim(),
      quantity: Number(item.quantity ?? 0),
      unit_price: Number(item.unit_price ?? 0),
    }))
    .filter((item) => item.sku.length > 0 && item.quantity > 0 && item.unit_price > 0);

  return {
    customer_name: draft.customer_name ?? undefined,
    customer_email: draft.customer_email ?? undefined,
    po_number: draft.po_number ?? undefined,
    requested_date: draft.requested_date ?? undefined,
    ship_to: draft.ship_to ?? undefined,
    currency: draft.currency ?? undefined,
    total_amount: draft.total_amount ?? undefined,
    extraction_confidence: draft.extraction_confidence ?? undefined,
    special_notes: draft.special_notes ?? undefined,
    line_items: normalizedLineItems,
  };
}

function normalizeSuggestedSkus(
  list: Array<
    | string
    | {
        sku: string;
        comfort_level: string;
        price_band: string;
        moq: number;
        lead_time_days: number;
        quality_standards: string;
        recommended_for: string;
      }
  >,
) {
  const guideBySku = new Map(skuGuide.map((item) => [item.sku, item]));
  return list.map((item) => {
    const sku = typeof item === "string" ? item.toUpperCase().trim() : item.sku;
    const guide = guideBySku.get(sku);
    const comfortLevel = typeof item === "string" ? "" : item.comfort_level;
    const priceBand = typeof item === "string" ? "" : item.price_band;
    const moq = typeof item === "string" ? 0 : item.moq;
    const leadTimeDays = typeof item === "string" ? 0 : item.lead_time_days;
    const qualityStandards = typeof item === "string" ? "" : item.quality_standards;
    const recommendedFor = typeof item === "string" ? "" : item.recommended_for;
    return {
      sku,
      comfort_level: comfortLevel || guide?.comfort_level || "Not specified",
      price_band: priceBand || guide?.price_band || "Not specified",
      moq: moq > 0 ? moq : (guide?.moq ?? 0),
      lead_time_days: leadTimeDays > 0 ? leadTimeDays : (guide?.lead_time_days ?? 0),
      quality_standards: qualityStandards || guide?.quality_standards || "Not specified",
      recommended_for: recommendedFor || guide?.recommended_for || "Not specified",
    };
  });
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateYYYYMMDD(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeSku(rawSku: string, skuAliases: Record<string, string>, validSkus: Set<string>) {
  const trimmed = rawSku.trim().toUpperCase();
  const mapped = skuAliases[trimmed] ?? trimmed;
  return validSkus.has(mapped) ? mapped : "";
}

function getSkuGuide(sku: string) {
  return skuGuide.find((g) => g.sku === sku);
}

function getContractUnitPrice(customerEmail: string, sku: string) {
  const customerPrices = contractPricesByCustomerEmail[customerEmail.toLowerCase()];
  if (customerPrices && customerPrices[sku] && customerPrices[sku] > 0) {
    return customerPrices[sku];
  }
  return getSkuGuide(sku)?.list_price ?? 0;
}

function generatePurchaseOrderNumber(profile: ChatProfile) {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.floor(1000 + Math.random() * 9000);
  const customerTag = profile.customer_name.replace(/[^A-Z0-9]/gi, "").slice(0, 4).toUpperCase() || "SBB";
  return `SBB-${customerTag}-${datePart}-${suffix}`;
}

function finalizeDraft(
  draft: Partial<OrderCaptureDraft>,
  profile: ChatProfile,
  masterData: ReturnType<typeof getOrderCaptureMasterData>,
) {
  const validSkus = new Set(masterData.valid_skus);
  const normalizedItems = (draft.line_items ?? [])
    .map((item) => {
      const sku = normalizeSku(item.sku, masterData.sku_aliases, validSkus);
      const quantity = Number(item.quantity ?? 0);
      const suppliedPrice = Number(item.unit_price ?? 0);
      const contractPrice = sku ? getContractUnitPrice(profile.customer_email, sku) : 0;
      const unitPrice = suppliedPrice > 0 ? suppliedPrice : contractPrice;
      return { sku, quantity, unit_price: unitPrice };
    })
    .filter((item) => item.sku && item.quantity > 0 && item.unit_price > 0);

  const maxLeadTime = normalizedItems.reduce((maxDays, item) => {
    const lead = getSkuGuide(item.sku)?.lead_time_days ?? 7;
    return Math.max(maxDays, lead);
  }, 7);

  const requestedDate = draft.requested_date || formatDateYYYYMMDD(addDays(new Date(), maxLeadTime));
  const totalAmount = normalizedItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const readyToPost = normalizedItems.length > 0;

  const completedDraft: Partial<OrderCaptureDraft> = {
    customer_name: draft.customer_name || profile.customer_name,
    customer_email: draft.customer_email || profile.customer_email,
    po_number: draft.po_number || generatePurchaseOrderNumber(profile),
    requested_date: requestedDate,
    ship_to: draft.ship_to || profile.ship_to_default,
    currency: (draft.currency || profile.currency || "USD").toUpperCase(),
    line_items: normalizedItems,
    total_amount: Number(totalAmount.toFixed(2)),
    extraction_confidence: readyToPost ? 0.96 : 0.9,
    special_notes: draft.special_notes || "Captured via Order Capture Chatbot",
  };

  return {
    completedDraft,
    readyToPost,
    missingFields: readyToPost ? [] : ["line_items (sku + quantity)"],
  };
}

function buildPricingQuotes(
  draft: Partial<OrderCaptureDraft>,
  profile: ChatProfile,
): PricingQuote[] {
  const currency = (draft.currency || profile.currency || "USD").toUpperCase();
  const lineItems = draft.line_items ?? [];

  return lineItems.map((item) => {
    const clause = `Contract SBB-HSP-2026-MSA, Clause 4.2: ${item.sku} fixed unit price ${currency} ${item.unit_price.toFixed(2)} for ${profile.customer_name}, subject to MOQ and annual review terms.`;
    return {
      sku: item.sku,
      unit_price: Number(item.unit_price.toFixed(2)),
      currency,
      contract_clause: clause,
      contract_link: `/catalog?sku=${encodeURIComponent(item.sku)}`,
    };
  });
}

export async function runOrderCaptureChatTurn(input: ChatTurnInput) {
  const masterData = getOrderCaptureMasterData();

  const systemPrompt = [
    "You are SBB's Order Capture Chatbot for hospitality mattress B2B orders.",
    "You must only discuss mattress order capture for SBB. Never provide guidance for other brands or unrelated topics.",
    "If user asks off-topic or non-SBB brand questions, set guardrail_blocked=true and explain the constraint briefly.",
    "Be natural and conversational.",
    "Ask one focused follow-up question at a time to collect missing order details.",
    "Avoid sounding like a form; guide the user interactively.",
    "You can answer product questions including quality, price, MOQ, comfort levels, comparison of SKUs, expected lifetime, warranty, and customer feedback.",
    "Primary conversation goal: identify SKUs and quantities requested.",
    "After SKUs and quantities are known, other attributes are auto-populated from profile and contract context.",
    "Always prefer collecting and confirming required order fields for posting:",
    "line_items[{sku,quantity,unit_price}] is mandatory from conversation. Other fields can be auto-populated.",
    "Use sign-in profile as the default source of customer_name/customer_email/ship_to/currency unless user explicitly overrides.",
    "Guide SKU selection with B2B context: volume, price band, lead time, comfort level, quality standards, expected lifetime, warranty, customer feedback, and fit-for-property.",
    "Normalize SKU aliases using master_data.sku_aliases and keep only valid master_data.valid_skus.",
    "Do not ask user for PO number or contract price; those are system-generated.",
    "Recompute total_amount from line_items when possible.",
    "Set extraction_confidence between 0.85 and 0.99 when draft is mature; lower only if details are still ambiguous.",
    "Return ONLY JSON with keys:",
    "assistant_message, guardrail_blocked, guardrail_reason, order_draft, missing_fields, ready_to_post, suggested_skus.",
    "No markdown.",
  ].join(" ");

  const raw = await runWithAgentSdkStrict(
    systemPrompt,
    JSON.stringify({
      user_message: input.message,
      history: input.history,
      current_draft: input.draft,
      sign_in_profile: input.profile,
      master_data: masterData,
      sku_guide: skuGuide,
    }),
  );

  const parsed = responseSchema.parse(parseJsonObject(raw));
  const modelDraft = mergeDraft(input.draft, normalizePartialDraft(parsed.order_draft));
  const { completedDraft, readyToPost, missingFields } = finalizeDraft(modelDraft, input.profile, masterData);

  return {
    assistant_message: parsed.assistant_message,
    guardrail_blocked: parsed.guardrail_blocked,
    guardrail_reason: parsed.guardrail_reason ?? "",
    order_draft: completedDraft,
    missing_fields: missingFields.length > 0 ? missingFields : parsed.missing_fields,
    ready_to_post: readyToPost,
    suggested_skus: normalizeSuggestedSkus(parsed.suggested_skus),
    pricing_quotes: buildPricingQuotes(completedDraft, input.profile),
  };
}

export function buildDefaultChatProfile(): ChatProfile {
  const email = (process.env.DEMO_SIGNIN_EMAIL ?? "procurement@harborviewsuites.com").toLowerCase();
  const masterData = getOrderCaptureMasterData();
  const mapped = masterData.customer_by_sender[email];

  return {
    user_name: process.env.DEMO_SIGNIN_USER_NAME ?? "Hospitality Procurement User",
    user_email: email,
    customer_name: mapped?.customer_name ?? process.env.DEMO_CUSTOMER_NAME ?? "SBB Hospitality Customer",
    customer_email: mapped?.customer_email ?? email,
    customer_id: process.env.DEMO_CUSTOMER_ID ?? "CUST-HOSP-001",
    ship_to_default: process.env.DEMO_SHIP_TO ?? "Receiving Dock, 200 Atlantic Ave, Boston MA",
    currency: process.env.DEMO_CURRENCY ?? "USD",
  };
}

import { z } from "zod";
import { runWithAgentSdkStrict } from "@/lib/agents/sdk";
import type { HeldOrder, HoldResolutionProposal } from "@/lib/types";

const outputSchema = z.object({
  hold_reason_category: z.string(),
  owner_team: z.string(),
  recommended_decision: z.enum(["release", "conditional_release", "escalate"]),
  expected_time_to_release_hours: z.number().min(0),
  required_actions: z.array(z.string()).default([]),
  release_conditions: z.array(z.string()).default([]),
  customer_message: z.string(),
  internal_note: z.string(),
});

function parseAgentJson(raw: string) {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fence ? fence[1].trim() : trimmed);
}

function categorizeHold(order: HeldOrder) {
  const holdText = order.hold_reasons.join(" ").toLowerCase();

  if (holdText.includes("blacklisted")) {
    return {
      hold_reason_category: "policy_block",
      owner_team: "Credit Committee",
      recommended_decision: "escalate" as const,
      expected_time_to_release_hours: 48,
      required_actions: [
        "Confirm blacklist status against customer policy register",
        "Escalate to credit committee for exception review",
        "Block shipment release until committee decision is logged",
      ],
      release_conditions: [],
      customer_message:
        "Your order is currently under policy review. Our credit team will contact you if additional documentation is required.",
      internal_note: "Hard policy block detected. Do not release without committee approval.",
    };
  }

  if (holdText.includes("utilization exceeds") || holdText.includes("credit limit")) {
    return {
      hold_reason_category: "credit_limit",
      owner_team: "Credit Operations",
      recommended_decision: "conditional_release" as const,
      expected_time_to_release_hours: 24,
      required_actions: [
        "Request 30% prepayment or deposit",
        "Evaluate temporary credit extension request against current exposure",
        "Release in controlled shipment tranche after finance approval",
      ],
      release_conditions: ["Prepayment received", "Credit controller sign-off recorded"],
      customer_message:
        "Your order is on temporary credit hold. We can release it once the agreed deposit or credit approval is confirmed.",
      internal_note: "Exposure exceeds policy threshold. Use prepayment or temporary limit increase as cure path.",
    };
  }

  if (holdText.includes("dispute")) {
    return {
      hold_reason_category: "open_disputes",
      owner_team: "Dispute Operations",
      recommended_decision: "conditional_release" as const,
      expected_time_to_release_hours: 36,
      required_actions: [
        "Open dispute workbench review for blocking invoices",
        "Separate valid service disputes from unsupported deductions",
        "Obtain collections and dispute lead sign-off before release",
      ],
      release_conditions: ["Blocking disputes triaged", "Net collectible exposure within threshold"],
      customer_message:
        "We are reviewing open billing disputes linked to your account and will update you once the release conditions are cleared.",
      internal_note: "Dispute exposure is the main blocker. Coordinate with dispute triage before releasing.",
    };
  }

  if (holdText.includes("late-payment") || holdText.includes("payment behavior")) {
    return {
      hold_reason_category: "overdue_ar",
      owner_team: "Collections",
      recommended_decision: "conditional_release" as const,
      expected_time_to_release_hours: 18,
      required_actions: [
        "Prioritize customer in collections queue",
        "Secure payment commitment or same-day remittance proof",
        "Recalculate account exposure after promised payment amount",
      ],
      release_conditions: ["Payment promise logged", "Exposure returns to policy band"],
      customer_message:
        "We are reviewing overdue balances on the account. Please share remittance details so we can expedite order release.",
      internal_note: "Collections-led cure path. Release only after payment commitment reduces current risk.",
    };
  }

  return {
    hold_reason_category: "manual_review",
    owner_team: "Credit Operations",
    recommended_decision: "escalate" as const,
    expected_time_to_release_hours: 24,
    required_actions: [
      "Review order with credit analyst",
      "Confirm missing documents or approvals",
      "Escalate unresolved exceptions to finance manager",
    ],
    release_conditions: [],
    customer_message:
      "Your order is under manual review. Our team will reach out if anything further is needed to proceed.",
    internal_note: "Fallback exception path. Insufficient hold detail for auto-cure.",
  };
}

async function refineNarrativeWithAgent(base: HoldResolutionProposal, order: HeldOrder): Promise<HoldResolutionProposal> {
  const systemPrompt = [
    "You are a Hold Resolution Agent for order-to-cash.",
    "Given a fixed resolution path, improve only the narrative fields and action phrasing.",
    "Do not change hold_reason_category, owner_team, recommended_decision, or expected_time_to_release_hours.",
    "Return ONLY JSON with keys: hold_reason_category, owner_team, recommended_decision, expected_time_to_release_hours, required_actions, release_conditions, customer_message, internal_note.",
  ].join(" ");

  const raw = await runWithAgentSdkStrict(
    systemPrompt,
    JSON.stringify({
      held_order: order,
      baseline: base,
    }),
  );
  const parsed = outputSchema.parse(parseAgentJson(raw));
  return {
    capture_id: order.capture_id,
    ...parsed,
  };
}

export async function runHoldResolutionAgent(order: HeldOrder): Promise<HoldResolutionProposal> {
  const base = {
    capture_id: order.capture_id,
    ...categorizeHold(order),
  };

  try {
    return await refineNarrativeWithAgent(base, order);
  } catch {
    return base;
  }
}

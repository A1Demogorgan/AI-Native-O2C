import type { Kpis, WorkingCapitalInsight } from "@/lib/types";

export function runWorkingCapitalIntelligenceAgent(input: {
  kpis: Kpis;
  open_disputes: number;
  open_collections: number;
}): WorkingCapitalInsight[] {
  return [
    {
      insight_type: "dso",
      severity: input.kpis.dso_proxy > 45 ? "high" : input.kpis.dso_proxy > 30 ? "medium" : "low",
      title: "DSO Pressure",
      summary: `Current DSO proxy is ${input.kpis.dso_proxy.toFixed(1)} days.`,
      metric_value: input.kpis.dso_proxy,
      recommendation: "Focus collections sequencing on the highest-value overdue balances.",
    },
    {
      insight_type: "disputes",
      severity: input.open_disputes > 100 ? "high" : input.open_disputes > 40 ? "medium" : "low",
      title: "Dispute Drag",
      summary: `${input.open_disputes} disputes are currently open and may be delaying cash conversion.`,
      metric_value: input.open_disputes,
      recommendation: "Prioritize dispute resolution on invoices tied to strategic customers.",
    },
    {
      insight_type: "collections",
      severity: input.open_collections > 100 ? "medium" : "low",
      title: "Collections Workload",
      summary: `${input.open_collections} active collections actions are open in the queue.`,
      metric_value: input.open_collections,
      recommendation: "Rebalance workload across collectors and automate low-complexity reminders.",
    },
  ];
}

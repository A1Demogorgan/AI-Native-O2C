import { NextRequest, NextResponse } from "next/server";
import { runWithAgentSdk } from "@/lib/agents/sdk";
import { buildConsultantBrief } from "@/lib/consultant/context";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | {
        area_id?: string;
        area_label?: string;
        messages?: ChatMessage[];
      }
    | null;

  const areaId = body?.area_id?.trim() || "portfolio";
  const areaLabel = body?.area_label?.trim() || undefined;
  const messages = Array.isArray(body?.messages) ? body!.messages.filter((m) => m && typeof m.content === "string") : [];
  const brief = await buildConsultantBrief(areaId, areaLabel);
  const latestUser = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";

  const systemPrompt = [
    "You are an O2C consultant for an order-to-cash operations application.",
    "Be concise, practical, and business specific.",
    "Ground every answer in the provided context. If context is missing, say so briefly and make a careful inference.",
    "Optimize for O2C cycle time, top-line realization, DSO, customer behavior, and next-best action.",
    "Use short sections only when helpful.",
  ].join(" ");

  const input = JSON.stringify({
    area: { id: brief.areaId, label: brief.areaLabel },
    insight: {
      title: brief.insightTitle,
      teaser: brief.teaser,
      summary: brief.contextSummary,
      metrics: brief.metrics,
      recommendations: brief.recommendations,
      suggestedQuestions: brief.suggestedQuestions,
    },
    conversation: messages,
    latest_user_message: latestUser,
  });

  const reply = await runWithAgentSdk(systemPrompt, input);
  const fallback =
    brief.recommendations.length > 0
      ? `${brief.insightTitle}. ${brief.teaser} Priority actions: ${brief.recommendations.slice(0, 2).join(" ")}`
      : `${brief.insightTitle}. ${brief.teaser}`;

  return NextResponse.json({
    reply: reply?.trim() || fallback,
    brief,
  });
}

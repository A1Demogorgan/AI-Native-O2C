import { NextResponse } from "next/server";
import { z } from "zod";
import { listWorkflowAgentActionsByAgent } from "@/lib/db/dao";

export const runtime = "nodejs";

const schema = z.object({
  agent_id: z.string().min(1),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = schema.safeParse({
    agent_id: url.searchParams.get("agent_id"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "agent_id is required" }, { status: 400 });
  }

  const rows = await listWorkflowAgentActionsByAgent(parsed.data.agent_id, 200);
  return NextResponse.json(rows);
}

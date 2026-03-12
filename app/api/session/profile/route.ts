import { NextResponse } from "next/server";
import { buildDefaultChatProfile } from "@/lib/agents/orderCaptureChatAgent";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(buildDefaultChatProfile());
}

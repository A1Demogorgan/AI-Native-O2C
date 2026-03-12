import { NextResponse } from "next/server";
import { z } from "zod";
import { applyEdiOrderAction } from "@/lib/edi/orders";

export const runtime = "nodejs";

const schema = z.object({
  file_name: z.string().min(1),
  action: z.enum(["accept", "reject", "hold"]),
});

export async function POST(req: Request) {
  const body = schema.parse(await req.json());

  try {
    const order = await applyEdiOrderAction(body.file_name, body.action);
    return NextResponse.json({ order });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to apply EDI action." },
      { status: 400 },
    );
  }
}

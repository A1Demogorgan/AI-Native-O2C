import { NextResponse } from "next/server";
import { z } from "zod";
import { processEdiOrder } from "@/lib/edi/orders";

export const runtime = "nodejs";

const schema = z.object({
  file_name: z.string().min(1),
});

export async function POST(req: Request) {
  const body = schema.parse(await req.json());

  try {
    const order = await processEdiOrder(body.file_name);
    return NextResponse.json({ order });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process EDI order." },
      { status: 400 },
    );
  }
}

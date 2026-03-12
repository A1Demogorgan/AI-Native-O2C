import { NextResponse } from "next/server";
import { resetAllEdiOrderProcessing } from "@/lib/edi/orders";

export const runtime = "nodejs";

export async function POST() {
  try {
    const orders = await resetAllEdiOrderProcessing();
    return NextResponse.json({ orders });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reset all EDI orders." },
      { status: 400 },
    );
  }
}

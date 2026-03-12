import { createCapturedOrder, listCapturedOrders } from "@/lib/db/dao";

export async function createCapturedOrderTool(input: Parameters<typeof createCapturedOrder>[0]) {
  return createCapturedOrder(input);
}

export async function listCapturedOrdersTool(limit = 100) {
  return listCapturedOrders(limit);
}

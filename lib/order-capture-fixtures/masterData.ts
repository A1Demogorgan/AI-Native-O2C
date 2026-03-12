export type OrderCaptureMasterData = {
  customer_by_sender: Record<string, { customer_name: string; customer_email: string }>;
  sku_aliases: Record<string, string>;
  valid_skus: string[];
};

const MASTER_DATA: OrderCaptureMasterData = {
  customer_by_sender: {
    "procurement@harborviewsuites.com": {
      customer_name: "HarborView Suites Boston",
      customer_email: "procurement@harborviewsuites.com",
    },
    "supplychain@lotushospitalitygroup.com": {
      customer_name: "Lotus Riverside Chicago",
      customer_email: "supplychain@lotushospitalitygroup.com",
    },
    "opsbuying@sunsetresortcollection.com": {
      customer_name: "Sunset Resort Las Vegas",
      customer_email: "opsbuying@sunsetresortcollection.com",
    },
  },
  sku_aliases: {
    "HTL-KING-PLUSH-V1": "HTL-KING-PLUSH",
    "HTL-QUEEN-FIRM-OLD": "HTL-QUEEN-FIRM",
    "HTL-KING-HYBRID-2024": "HTL-KING-HYBRID",
    "HTL-TWIN-FIRM-LEGACY": "HTL-TWIN-FIRM",
    "HTL-CAL-KING-PREMIUM-X": "HTL-CAL-KING-PREMIUM",
    "HTL-QUEEN-PREMIUM-X": "HTL-QUEEN-PREMIUM",
  },
  valid_skus: [
    "HTL-KING-PLUSH",
    "HTL-QUEEN-FIRM",
    "HTL-KING-HYBRID",
    "HTL-TWIN-FIRM",
    "HTL-CAL-KING-PREMIUM",
    "HTL-QUEEN-PREMIUM",
  ],
};

export function getOrderCaptureMasterData(): OrderCaptureMasterData {
  return MASTER_DATA;
}

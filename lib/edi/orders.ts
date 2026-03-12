import fs from "node:fs/promises";
import path from "node:path";
import { getOrderCaptureMasterData } from "@/lib/order-capture-fixtures/masterData";
import type { EdiOrderAction, EdiOrderLine, EdiOrderRecord, EdiValidationIssue } from "@/lib/types";

type ParsedEdiOrder = {
  file_name: string;
  file_path: string;
  buyer_name: string;
  buyer_code: string;
  po_number: string;
  order_date: string;
  requested_date: string;
  ship_to: string;
  currency: string;
  total_amount: number;
  line_count: number;
  interchange_control_number: string;
  group_control_number: string;
  transaction_set_control_number: string;
  lines: EdiOrderLine[];
  structural: {
    st_code: string;
    se_count: number;
    computed_se_count: number;
    ctt_count: number;
    transaction_segment_count: number;
  };
};

type PersistedStatus = {
  processed: boolean;
  processed_at: string | null;
  processing_outcome: "pass" | "fail" | null;
  issues: EdiValidationIssue[];
  action: EdiOrderAction | null;
  action_at: string | null;
};

type StatusStore = {
  version: number;
  orders: Record<string, PersistedStatus>;
};

const DATA_DIR = path.join(process.cwd(), "data", "synthetic-edi-x12-pos");
const STATUS_FILE = path.join(DATA_DIR, "processing-status.json");

const KNOWN_BUYERS: Record<string, { buyer_name: string; buyer_code: string }> = {
  HVSBOS: { buyer_name: "HarborView Suites Boston", buyer_code: "HVSBOS" },
  LRCCHI: { buyer_name: "Lotus Riverside Chicago", buyer_code: "LRCCHI" },
  SRCLAS: { buyer_name: "Sunset Resort Las Vegas", buyer_code: "SRCLAS" },
};

const PRICE_BOOK: Record<string, number> = {
  "HTL-KING-PLUSH": 465,
  "HTL-QUEEN-FIRM": 425,
  "HTL-KING-HYBRID": 545,
  "HTL-TWIN-FIRM": 305,
  "HTL-CAL-KING-PREMIUM": 625,
  "HTL-QUEEN-PREMIUM": 515,
};

function parseIsoDate(value: string) {
  if (!/^\d{8}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function safeNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function issue(input: Omit<EdiValidationIssue, "issue"> & { issue?: string }): EdiValidationIssue {
  return {
    issue: input.issue ?? input.code,
    ...input,
  };
}

async function readStatusStore(): Promise<StatusStore> {
  try {
    const raw = await fs.readFile(STATUS_FILE, "utf8");
    const parsed = JSON.parse(raw) as StatusStore;
    return {
      version: parsed.version ?? 1,
      orders: parsed.orders ?? {},
    };
  } catch {
    return { version: 1, orders: {} };
  }
}

async function writeStatusStore(store: StatusStore) {
  await fs.writeFile(`${STATUS_FILE}`, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function defaultStatus(): PersistedStatus {
  return {
    processed: false,
    processed_at: null,
    processing_outcome: null,
    issues: [],
    action: null,
    action_at: null,
  };
}

async function listEdiFiles() {
  const rows = await fs.readdir(DATA_DIR, { withFileTypes: true });
  return rows
    .filter((row) => row.isFile() && row.name.endsWith(".x12"))
    .map((row) => row.name)
    .sort((a, b) => a.localeCompare(b));
}

function parseSegments(raw: string) {
  return raw
    .split("~")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.split("*"));
}

async function parseEdiFile(fileName: string): Promise<ParsedEdiOrder> {
  const filePath = path.join(DATA_DIR, fileName);
  const raw = await fs.readFile(filePath, "utf8");
  const segments = parseSegments(raw);

  const isa = segments.find((segment) => segment[0] === "ISA") ?? [];
  const gs = segments.find((segment) => segment[0] === "GS") ?? [];
  const st = segments.find((segment) => segment[0] === "ST") ?? [];
  const beg = segments.find((segment) => segment[0] === "BEG") ?? [];
  const dtm = segments.find((segment) => segment[0] === "DTM" && segment[1] === "002") ?? [];
  const by = segments.find((segment) => segment[0] === "N1" && segment[1] === "BY") ?? [];
  const stPartyIndex = segments.findIndex((segment) => segment[0] === "N1" && segment[1] === "ST");
  const stParty = stPartyIndex >= 0 ? segments[stPartyIndex] : [];
  const n3 = stPartyIndex >= 0 ? segments[stPartyIndex + 1] ?? [] : [];
  const n4 = stPartyIndex >= 0 ? segments[stPartyIndex + 2] ?? [] : [];
  const se = segments.find((segment) => segment[0] === "SE") ?? [];
  const ctt = segments.find((segment) => segment[0] === "CTT") ?? [];

  const lines: EdiOrderLine[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment[0] !== "PO1") continue;
    const next = segments[index + 1] ?? [];
    const bpIndex = segment.findIndex((value) => value === "BP");
    const sku = bpIndex >= 0 ? segment[bpIndex + 1] ?? "" : "";
    const description = next[0] === "PID" ? next[5] ?? "" : "";
    const quantity = safeNumber(segment[2] ?? "0");
    const unitPrice = safeNumber(segment[4] ?? "0");
    lines.push({
      line_number: segment[1] ?? "",
      sku,
      description,
      quantity,
      unit_price: unitPrice,
      line_total: Number((quantity * unitPrice).toFixed(2)),
    });
  }

  const orderDate = parseIsoDate(beg[5] ?? "") ?? "";
  const requestedDate = parseIsoDate(dtm[2] ?? "") ?? "";
  const shipToName = stParty[2] ?? "";
  const shipToAddress = n3[1] ?? "";
  const shipToCity = n4[1] ?? "";
  const shipToState = n4[2] ?? "";
  const shipToPostal = n4[3] ?? "";
  const shipTo = [shipToName, shipToAddress, [shipToCity, shipToState, shipToPostal].filter(Boolean).join(", ")].filter(Boolean).join(" | ");

  const transactionStart = segments.findIndex((segment) => segment[0] === "ST");
  const transactionEnd = segments.findIndex((segment) => segment[0] === "SE");
  const transactionSegmentCount = transactionStart >= 0 && transactionEnd >= transactionStart ? transactionEnd - transactionStart + 1 : 0;

  return {
    file_name: fileName,
    file_path: filePath,
    buyer_name: by[2] ?? "",
    buyer_code: by[4] ?? "",
    po_number: beg[3] ?? "",
    order_date: orderDate,
    requested_date: requestedDate,
    ship_to: shipTo,
    currency: "USD",
    total_amount: Number(lines.reduce((sum, line) => sum + line.line_total, 0).toFixed(2)),
    line_count: lines.length,
    interchange_control_number: isa[13] ?? "",
    group_control_number: gs[6] ?? "",
    transaction_set_control_number: st[2] ?? "",
    lines,
    structural: {
      st_code: st[1] ?? "",
      se_count: Number(se[1] ?? 0),
      computed_se_count: transactionSegmentCount,
      ctt_count: Number(ctt[1] ?? 0),
      transaction_segment_count: transactionSegmentCount,
    },
  };
}

function validateOrder(order: ParsedEdiOrder, allOrders: ParsedEdiOrder[]): EdiValidationIssue[] {
  const issues: EdiValidationIssue[] = [];
  const masterData = getOrderCaptureMasterData();
  const buyerRule = KNOWN_BUYERS[order.buyer_code];
  const duplicatePoCount = allOrders.filter((candidate) => candidate.po_number === order.po_number).length;

  if (order.structural.st_code !== "850") {
    issues.push(
      issue({
        code: "TRANSACTION_TYPE_INVALID",
        field: "ST01",
        severity: "high",
        actual: order.structural.st_code || "(blank)",
        expected: "850",
        reason: "Only X12 850 purchase orders are supported in this workspace.",
      }),
    );
  }

  if (order.structural.se_count !== order.structural.computed_se_count) {
    issues.push(
      issue({
        code: "SE_COUNT_MISMATCH",
        field: "SE01",
        severity: "high",
        actual: String(order.structural.se_count),
        expected: String(order.structural.computed_se_count),
        reason: "The reported transaction segment count does not match the actual segment count.",
      }),
    );
  }

  if (order.structural.ctt_count !== order.line_count) {
    issues.push(
      issue({
        code: "CTT_COUNT_MISMATCH",
        field: "CTT01",
        severity: "high",
        actual: String(order.structural.ctt_count),
        expected: String(order.line_count),
        reason: "The CTT line count must equal the number of PO1 segments.",
      }),
    );
  }

  if (!order.po_number) {
    issues.push(
      issue({
        code: "MISSING_PO_NUMBER",
        field: "BEG03",
        severity: "high",
        actual: "(blank)",
        expected: "Unique PO number",
        reason: "Each order must include a purchase order number.",
      }),
    );
  }

  if (duplicatePoCount > 1) {
    issues.push(
      issue({
        code: "DUPLICATE_PO_NUMBER",
        field: "BEG03",
        severity: "high",
        actual: order.po_number,
        expected: "Unique across all EDI orders",
        reason: "Duplicate PO numbers create downstream booking and fulfillment conflicts.",
      }),
    );
  }

  if (!buyerRule || buyerRule.buyer_name !== order.buyer_name) {
    issues.push(
      issue({
        code: "BUYER_NOT_RECOGNIZED",
        field: "N1*BY",
        severity: "high",
        actual: `${order.buyer_code} | ${order.buyer_name}`.trim(),
        expected: "Known customer in EDI trading partner list",
        reason: "Buyer code/name must map to a supported customer account.",
      }),
    );
  }

  if (!order.ship_to) {
    issues.push(
      issue({
        code: "SHIP_TO_MISSING",
        field: "N1*ST",
        severity: "high",
        actual: "(blank)",
        expected: "Valid ship-to address",
        reason: "Fulfillment cannot proceed without a ship-to destination.",
      }),
    );
  }

  if (!order.order_date || !order.requested_date) {
    issues.push(
      issue({
        code: "DATE_MISSING",
        field: "BEG05/DTM02",
        severity: "high",
        actual: `${order.order_date || "(blank)"} | ${order.requested_date || "(blank)"}`,
        expected: "Valid order and requested dates",
        reason: "Both order date and requested date are required for planning.",
      }),
    );
  } else if (order.requested_date < order.order_date) {
    issues.push(
      issue({
        code: "REQUEST_DATE_BEFORE_ORDER_DATE",
        field: "DTM02",
        severity: "high",
        actual: order.requested_date,
        expected: `>= ${order.order_date}`,
        reason: "Requested ship date cannot be earlier than the PO creation date.",
      }),
    );
  }

  if (order.line_count === 0) {
    issues.push(
      issue({
        code: "NO_LINE_ITEMS",
        field: "PO1",
        severity: "high",
        actual: "0",
        expected: "At least 1 line",
        reason: "Purchase orders must contain at least one item line.",
      }),
    );
  }

  for (const line of order.lines) {
    if (!masterData.valid_skus.includes(line.sku)) {
      issues.push(
        issue({
          code: "SKU_INVALID",
          field: `PO1-${line.line_number}`,
          severity: "high",
          actual: line.sku || "(blank)",
          expected: masterData.valid_skus.join(", "),
          reason: "The SKU is not present in current product master data.",
        }),
      );
    }

    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      issues.push(
        issue({
          code: "QUANTITY_INVALID",
          field: `PO1-${line.line_number}`,
          severity: "high",
          actual: String(line.quantity),
          expected: "Positive whole number",
          reason: "Quantities must be positive integers.",
        }),
      );
    }

    if (line.unit_price <= 0) {
      issues.push(
        issue({
          code: "UNIT_PRICE_INVALID",
          field: `PO1-${line.line_number}`,
          severity: "high",
          actual: String(line.unit_price),
          expected: "Positive unit price",
          reason: "Line price must be greater than zero.",
        }),
      );
    }

    const bookPrice = PRICE_BOOK[line.sku];
    if (bookPrice) {
      const minPrice = bookPrice * 0.8;
      const maxPrice = bookPrice * 1.2;
      if (line.unit_price < minPrice || line.unit_price > maxPrice) {
        issues.push(
          issue({
            code: "PRICE_OUT_OF_RANGE",
            field: `PO1-${line.line_number}`,
            severity: "medium",
            actual: line.unit_price.toFixed(2),
            expected: `${minPrice.toFixed(2)}-${maxPrice.toFixed(2)}`,
            reason: "Unit price falls outside the expected tolerance band for this SKU.",
          }),
        );
      }
    }
  }

  return issues;
}

function mergeOrder(parsed: ParsedEdiOrder, status: PersistedStatus): EdiOrderRecord {
  return {
    file_name: parsed.file_name,
    file_path: parsed.file_path,
    buyer_name: parsed.buyer_name,
    buyer_code: parsed.buyer_code,
    po_number: parsed.po_number,
    order_date: parsed.order_date,
    requested_date: parsed.requested_date,
    ship_to: parsed.ship_to,
    currency: parsed.currency,
    total_amount: parsed.total_amount,
    line_count: parsed.line_count,
    interchange_control_number: parsed.interchange_control_number,
    group_control_number: parsed.group_control_number,
    transaction_set_control_number: parsed.transaction_set_control_number,
    processed: status.processed,
    processed_at: status.processed_at,
    processing_outcome: status.processing_outcome,
    action: status.action,
    action_at: status.action_at,
    issues: status.issues,
    lines: parsed.lines,
  };
}

export async function listEdiOrders(): Promise<EdiOrderRecord[]> {
  const [statusStore, fileNames] = await Promise.all([readStatusStore(), listEdiFiles()]);
  const parsed = await Promise.all(fileNames.map((fileName) => parseEdiFile(fileName)));
  return parsed.map((order) => mergeOrder(order, statusStore.orders[order.file_name] ?? defaultStatus()));
}

export async function processEdiOrder(fileName: string): Promise<EdiOrderRecord> {
  const [statusStore, fileNames] = await Promise.all([readStatusStore(), listEdiFiles()]);
  const parsed = await Promise.all(fileNames.map((name) => parseEdiFile(name)));
  const target = parsed.find((order) => order.file_name === fileName);
  if (!target) {
    throw new Error(`EDI order ${fileName} not found`);
  }

  const issues = validateOrder(target, parsed);
  const previous = statusStore.orders[fileName] ?? defaultStatus();
  const nextStatus: PersistedStatus = {
    ...previous,
    processed: true,
    processed_at: new Date().toISOString(),
    processing_outcome: issues.length === 0 ? "pass" : "fail",
    issues,
  };
  statusStore.orders[fileName] = nextStatus;
  await writeStatusStore(statusStore);
  return mergeOrder(target, nextStatus);
}

export async function applyEdiOrderAction(fileName: string, action: EdiOrderAction): Promise<EdiOrderRecord> {
  const [statusStore, parsed] = await Promise.all([
    readStatusStore(),
    parseEdiFile(fileName),
  ]);
  const current = statusStore.orders[fileName] ?? defaultStatus();
  if (!current.processed) {
    throw new Error("Order must be processed before an action can be applied");
  }
  const nextStatus: PersistedStatus = {
    ...current,
    action,
    action_at: new Date().toISOString(),
  };
  statusStore.orders[fileName] = nextStatus;
  await writeStatusStore(statusStore);
  return mergeOrder(parsed, nextStatus);
}

export async function resetEdiOrderProcessing(fileName: string): Promise<EdiOrderRecord> {
  const [statusStore, parsed] = await Promise.all([
    readStatusStore(),
    parseEdiFile(fileName),
  ]);

  statusStore.orders[fileName] = defaultStatus();
  await writeStatusStore(statusStore);
  return mergeOrder(parsed, statusStore.orders[fileName]);
}

export async function resetAllEdiOrderProcessing(): Promise<EdiOrderRecord[]> {
  const [statusStore, fileNames] = await Promise.all([readStatusStore(), listEdiFiles()]);
  const parsedOrders = await Promise.all(fileNames.map((fileName) => parseEdiFile(fileName)));

  for (const fileName of fileNames) {
    statusStore.orders[fileName] = defaultStatus();
  }

  await writeStatusStore(statusStore);
  return parsedOrders.map((order) => mergeOrder(order, statusStore.orders[order.file_name]));
}

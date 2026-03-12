import fs from "node:fs/promises";
import path from "node:path";

const outputDir = path.join(process.cwd(), "data", "synthetic-edi-x12-pos");
const orderCount = 100;

const buyers = [
  {
    code: "HVSBOS",
    name: "HarborView Suites Boston",
    senderId: "HARBORVIEWBOS",
    receiverId: "MATTRESSCO",
    contactName: "Lena Ortiz",
    contactPhone: "6175550142",
    contactEmail: "procurement@harborviewsuites.com",
    department: "EAST-OPS",
    shipTo: {
      code: "HVS-BOS-DC",
      name: "HarborView Suites Receiving",
      address1: "22 Atlantic Ave",
      city: "Boston",
      state: "MA",
      postalCode: "02110",
      country: "US",
    },
  },
  {
    code: "LRCCHI",
    name: "Lotus Riverside Chicago",
    senderId: "LOTUSRIVERCHI",
    receiverId: "MATTRESSCO",
    contactName: "Evan Kim",
    contactPhone: "3125550188",
    contactEmail: "supplychain@lotushospitalitygroup.com",
    department: "CENTRAL-REN",
    shipTo: {
      code: "LRC-CHI-RCV",
      name: "Lotus Riverside Loading Dock",
      address1: "401 W Wacker Dr",
      city: "Chicago",
      state: "IL",
      postalCode: "60606",
      country: "US",
    },
  },
  {
    code: "SRCLAS",
    name: "Sunset Resort Las Vegas",
    senderId: "SUNSETRESLV",
    receiverId: "MATTRESSCO",
    contactName: "Riya Menon",
    contactPhone: "7025550126",
    contactEmail: "opsbuying@sunsetresortcollection.com",
    department: "WEST-TOWER",
    shipTo: {
      code: "SRC-LV-DOCK",
      name: "Sunset Resort Expansion Dock",
      address1: "8900 W Flamingo Rd",
      city: "Las Vegas",
      state: "NV",
      postalCode: "89147",
      country: "US",
    },
  },
];

const catalog = [
  { sku: "HTL-KING-PLUSH", description: "Hospitality King Plush Mattress", basePrice: 465 },
  { sku: "HTL-QUEEN-FIRM", description: "Hospitality Queen Firm Mattress", basePrice: 425 },
  { sku: "HTL-KING-HYBRID", description: "Hospitality King Hybrid Mattress", basePrice: 545 },
  { sku: "HTL-TWIN-FIRM", description: "Hospitality Twin Firm Mattress", basePrice: 305 },
  { sku: "HTL-CAL-KING-PREMIUM", description: "Hospitality Cal King Premium Mattress", basePrice: 625 },
  { sku: "HTL-QUEEN-PREMIUM", description: "Hospitality Queen Premium Mattress", basePrice: 515 },
];

function pad(value, length) {
  return String(value).padStart(length, "0");
}

function formatDate(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1, 2)}${pad(date.getUTCDate(), 2)}`;
}

function formatTime(date) {
  return `${pad(date.getUTCHours(), 2)}${pad(date.getUTCMinutes(), 2)}`;
}

function money(value) {
  return value.toFixed(2);
}

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pickMany(rng, items, count) {
  const pool = [...items];
  const selected = [];
  for (let i = 0; i < count; i += 1) {
    const index = randomInt(rng, 0, pool.length - 1);
    selected.push(pool.splice(index, 1)[0]);
  }
  return selected;
}

function buildOrder(index) {
  const rng = createRng(20260312 + index * 7919);
  const buyer = buyers[index % buyers.length];
  const createdAt = new Date(Date.UTC(2026, 2, 1 + index, 8 + (index % 8), (index * 7) % 60));
  const requestedAt = new Date(createdAt);
  requestedAt.setUTCDate(requestedAt.getUTCDate() + 7 + (index % 9));

  const lineCount = 2 + (index % 3);
  const lines = pickMany(rng, catalog, lineCount).map((item, lineIndex) => {
    const quantity = randomInt(rng, 8, 42);
    const priceDelta = randomInt(rng, -25, 35);
    const unitPrice = item.basePrice + priceDelta;
    return {
      lineNumber: lineIndex + 1,
      quantity,
      unitPrice,
      ...item,
    };
  });

  const poNumber = `${buyer.code}-PO-2026-${pad(index + 1, 4)}`;
  const controlNumber = pad(700000000 + index + 1, 9);
  const interchangeNumber = pad(900000000 + index + 1, 9);
  const groupNumber = pad(5000 + index + 1, 4);

  if (index > 0 && index % 11 === 0) {
    requestedAt.setUTCDate(createdAt.getUTCDate() - 2);
  }

  if (index > 0 && index % 14 === 0) {
    lines[0].sku = "HTL-UNKNOWN-EDI";
    lines[0].description = "Unknown EDI Mattress SKU";
  }

  if (index > 0 && index % 17 === 0) {
    lines[0].unitPrice = Number((lines[0].unitPrice * 0.45).toFixed(2));
  }

  const segments = [
    `ST*850*${controlNumber}`,
    `BEG*00*NE*${poNumber}**${formatDate(createdAt)}`,
    `REF*DP*${buyer.department}`,
    `PER*BD*${buyer.contactName}*TE*${buyer.contactPhone}*EM*${buyer.contactEmail}`,
    `DTM*002*${formatDate(requestedAt)}`,
    `N1*BY*${buyer.name}*92*${buyer.code}`,
    `N1*ST*${buyer.shipTo.name}*92*${buyer.shipTo.code}`,
    `N3*${buyer.shipTo.address1}`,
    `N4*${buyer.shipTo.city}*${buyer.shipTo.state}*${buyer.shipTo.postalCode}*${buyer.shipTo.country}`,
  ];

  for (const line of lines) {
    segments.push(
      `PO1*${pad(line.lineNumber, 2)}*${line.quantity}*EA*${money(line.unitPrice)}**BP*${line.sku}*VP*${line.sku}`,
      `PID*F****${line.description}`,
    );
  }

  const cttCount = index > 0 && index % 19 === 0 ? lines.length + 1 : lines.length;
  segments.push(`CTT*${cttCount}`);
  segments.push(`SE*${segments.length + 1}*${controlNumber}`);

  const envelope = [
    `ISA*00*          *00*          *ZZ*${buyer.senderId.padEnd(15, " ")}*ZZ*${buyer.receiverId.padEnd(15, " ")}*${formatDate(createdAt).slice(2)}*${formatTime(createdAt)}*U*00401*${interchangeNumber}*0*T*:`,
    `GS*PO*${buyer.senderId}*${buyer.receiverId}*${formatDate(createdAt)}*${formatTime(createdAt)}*${groupNumber}*X*004010`,
    ...segments,
    `GE*1*${groupNumber}`,
    `IEA*1*${interchangeNumber}`,
  ];

  return {
    poNumber,
    buyer: buyer.name,
    fileName: `${poNumber}.x12`,
    payload: `${envelope.join("~") }~\n`,
  };
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const manifest = [];

  for (let index = 0; index < orderCount; index += 1) {
    const order = buildOrder(index);
    const filePath = path.join(outputDir, order.fileName);
    await fs.writeFile(filePath, order.payload, "utf8");
    manifest.push({
      file_name: order.fileName,
      po_number: order.poNumber,
      buyer: order.buyer,
    });
  }

  await fs.writeFile(
    path.join(outputDir, "manifest.json"),
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        count: manifest.length,
        files: manifest,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`Generated ${manifest.length} synthetic X12 850 orders in ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

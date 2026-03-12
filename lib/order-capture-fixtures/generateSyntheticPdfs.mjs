import fs from "node:fs";
import path from "node:path";

function pdfEscape(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function makePdf(lines) {
  const content = ["BT", "/F1 11 Tf", "14 TL", "50 760 Td"];
  for (let i = 0; i < lines.length; i += 1) {
    const prefix = i === 0 ? "" : "T* ";
    content.push(`${prefix}(${pdfEscape(lines[i])}) Tj`);
  }
  content.push("ET");
  const stream = content.join("\n");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];

  let body = "";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(body.length);
    body += obj;
  }

  const xrefStart = Buffer.byteLength(`%PDF-1.4\n${body}`, "utf8");
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    const offset = Buffer.byteLength(`%PDF-1.4\n${body.slice(0, offsets[i])}`, "utf8");
    xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return `%PDF-1.4\n${body}${xref}${trailer}`;
}

const docs = [
  {
    file: "HVS_PO_2026_0310.pdf",
    lines: [
      "MattressCo Hospitality Order Form",
      "Customer: Harborview Hospitality Boston (Legacy Name)",
      "Customer Email: procurement@harborviewsuites.com",
      "PO Number: HVS-PO-2026-0310",
      "Requested Delivery Date: 2026-03-16",
      "Ship To: HarborView Suites Receiving Dock, 200 Atlantic Ave, Boston MA",
      "Currency: USD",
      "Item: HTL-KING-PLUSH-V1 qty 48 unit_price 289.00",
      "Item: HTL-QUEEN-FIRM-OLD qty 36 unit_price 239.00",
      "Total Amount: 22596.00",
      "Special Notes: Legacy SKU template used; elevator access after 6 AM",
    ],
  },
  {
    file: "LOTUS_RIVERSIDE_ORDER_77A.pdf",
    lines: [
      "MattressCo Hospitality Order Form",
      "Customer: Lotus Riverside Chicago",
      "Customer Email: supplychain@lotushospitalitygroup.com",
      "PO Number: LRG-PO-77A",
      "Requested Delivery Date: 2026-03-22",
      "Ship To: Lotus Riverside Loading Bay, 155 Wacker Drive, Chicago IL",
      "Currency: USD",
      "Item: HTL-KING-HYBRID-2024 qty 72 unit_price 315.00",
      "Item: HTL-TWIN-FIRM-LEGACY qty 24 unit_price 179.00",
      "Total Amount: 26928.00",
      "Special Notes: Renovation phase-2 floors 8 to 16",
    ],
  },
  {
    file: "SUNSET_RESORT_PO_1182.pdf",
    lines: [
      "MattressCo Hospitality Order Form",
      "Customer: Sunset Resort Las Vegas",
      "Customer Email: opsbuying@sunsetresortcollection.com",
      "PO Number: SRL-PO-1182",
      "Requested Delivery Date: 2026-03-28",
      "Ship To: Sunset Resort Tower C Warehouse, 90 Paradise Rd, Las Vegas NV",
      "Currency: USD",
      "Item: HTL-CAL-KING-PREMIUM-X qty 54 unit_price 369.00",
      "Item: HTL-QUEEN-PREMIUM-X qty 42 unit_price 319.00",
      "Total Amount: 33276.00",
      "Special Notes: Segmented by floor groups 20-24 and 25-29",
    ],
  },
];

const outDir = path.join(process.cwd(), "public", "synthetic-mail");
fs.mkdirSync(outDir, { recursive: true });

for (const doc of docs) {
  fs.writeFileSync(path.join(outDir, doc.file), makePdf(doc.lines));
}

console.log("Synthetic hospitality order PDFs generated.");

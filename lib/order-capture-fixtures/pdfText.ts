import fs from "node:fs";
import path from "node:path";

function unescapePdfString(text: string) {
  return text
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
}

export function extractTextFromSyntheticPdf(publicUrl: string) {
  const filePath = path.join(process.cwd(), "public", publicUrl.replace(/^\//, ""));
  const raw = fs.readFileSync(filePath, "latin1");
  const matches = [...raw.matchAll(/\(([^\)]*(?:\\\)[^\)]*)*)\)\s*Tj/g)];
  const lines = matches.map((m) => unescapePdfString(m[1])).filter(Boolean);
  return lines.join("\n");
}

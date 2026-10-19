import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPDF } from "../server/pdf.ts";
function syntheticPDF() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 500] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const text = "BT /F1 16 Tf 50 450 Td (Synthetic PDF fixture) Tj ET";
  objects.push(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, o] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1))
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
test("Node PDF extraction runs without Python and leaves unknown layouts unconfirmed", async () => {
  const data = await extractPDF(syntheticPDF(), "synthetic");
  assert.equal(data.pages, 1);
  assert.equal(data.tasks.length, 0);
  assert.match(data.warning, /자동 확정하지 않습니다/);
});

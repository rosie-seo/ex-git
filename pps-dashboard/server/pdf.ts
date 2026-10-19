import { getDocumentProxy } from "unpdf";
/** Candidate extraction only. The user reviews the PDF and confirms dates. */
export async function extractPDF(bytes: Uint8Array, version: string) {
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  const tasks: any[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n),
        viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items
        .filter((x: any) => "str" in x && x.str.trim())
        .map((x: any) => ({
          text: x.str.trim(),
          x: x.transform[4],
          y: viewport.height - x.transform[5],
        }));
      const heading = items
        .filter((x: any) => x.y < 65)
        .map((x: any) => x.text)
        .join(" ");
      if (!/제품화|시연/.test(heading)) continue;
      const rows = [
        170.14, 206.02, 238.76, 271.5, 305.3, 338.04, 370.78, 403.52, 436.26,
        469.0, 501.74,
      ];
      // Current WBS layout. Unknown layouts return no candidates instead of invented tasks.
      for (let i = 0; i < rows.length - 1; i++) {
        const row = items.filter(
          (x: any) => x.y >= rows[i] && x.y < rows[i + 1],
        );
        const boundary = heading.includes("#2")
          ? 162
          : heading.includes("업무")
            ? 174
            : 183;
        const name = row
          .filter((x: any) => x.x >= 28 && x.x < boundary)
          .map((x: any) => x.text)
          .join(" ")
          .trim();
        const owner = row
          .filter((x: any) => x.x >= boundary && x.x < 269)
          .map((x: any) => x.text)
          .join(" ")
          .trim();
        if (name)
          tasks.push({
            name,
            owner,
            product: heading,
            sourcePages: [n],
            sourceVersion: version,
            start: "",
            end: "",
            sourceStart: "",
            sourceEnd: "",
            targetId: "",
          });
      }
    }
    return {
      pages: doc.numPages,
      tasks,
      warning:
        "텍스트 표의 후보입니다. 원본 제품·담당자·일정과 기존 업무 대응을 확인하세요. 간트 일정은 자동 확정하지 않습니다.",
    };
  } finally {
    await doc.loadingTask.destroy();
  }
}

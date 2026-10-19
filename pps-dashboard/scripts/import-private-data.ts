/** Run LOCALLY after setting server-only Supabase variables. Never commit source files. */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { Store } from "../server/store.ts";
import { loadState, commitState, uploadFile } from "../server/supabase.ts";
import { upsertReport } from "../server/reports.ts";
const directory = process.argv[2];
if (!directory)
  throw Error(
    "Usage: npm run import:private -- /absolute/private-source-directory",
  );
const dir = resolve(directory),
  state = await loadState(),
  db = new Store(state.data);
const tasks = JSON.parse(readFileSync(join(dir, "seed-wbs.json"), "utf8"));
for (const t of tasks) {
  if (!db.get("tasks", t.id)) db.put("tasks", t.id, t);
}
const seed = JSON.parse(readFileSync(join(dir, "seed-notion.json"), "utf8"));
for (const r of seed.reports) {
  const p = r.properties || {},
    ownerIds = (p["담당자"] || []).flatMap(
      (x: string) => x.match(/user:\/\/[^"<]+/) || [],
    ),
    owner = r.body.match(/주차\s*([가-힣]{3})\s*일일/)?.[1] || "";
  const report = {
    ...r,
    owner,
    ownerIds,
    start: p["date:날짜 :start"] || null,
    end: p["date:날짜 :end"] || p["date:날짜 :start"] || null,
    source: "MCP 실제 보고 스냅샷",
  };
  upsertReport(db, report);
  db.put("seedReports", r.id, report);
}
for (const file of readdirSync(join(dir, "assets"))) {
  if (!/^(page-\d+\.png|wbs-v1\.7\.pdf)$/.test(file)) continue;
  await uploadFile(
    file,
    readFileSync(join(dir, "assets", file)),
    file.endsWith(".pdf") ? "application/pdf" : "image/png",
  );
}
db.put("documents", "v1.7", {
  id: "v1.7",
  name: "WBS v1.7",
  file: "wbs-v1.7.pdf",
  pages: 12,
  importedAt: new Date().toISOString(),
});
db.put("sync", "snapshot", {
  status: "snapshot",
  at: new Date().toISOString(),
  count: seed.reports.length,
  scope: "비공개 데이터 이관 / 전체 노션 동기화 아님",
});
await commitState(state.version, db);
console.log("Private import completed. Records were not written to Git.");

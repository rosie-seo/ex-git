import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.ts";
import { syncNotion } from "../server/notion.ts";
test("Notion adapter: 스키마 끝 공백, 페이지/블록 페이지네이션, 중첩 본문, 429 재시도", async () => {
  const oldFetch = global.fetch;
  process.env.NOTION_TOKEN = "test-only";
  process.env.NOTION_DATA_SOURCE_ID = "synthetic-source";
  const dir = mkdtempSync(join(tmpdir(), "pps-notion-")),
    db = new Store();
  const calls: string[] = [];
  let limited = false;
  const rich = (s: string) => [{ plain_text: s }];
  global.fetch = async (url: any, init: any) => {
    const path = String(url).split("/v1/")[1];
    calls.push(path);
    const ok = (data: any) =>
      Promise.resolve(
        new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    if (path.startsWith("data_sources/") && !path.endsWith("/query"))
      return ok({
        properties: {
          이름: { type: "title" },
          담당자: { type: "people" },
          "날짜 ": { type: "date" },
        },
      });
    if (path.endsWith("/query")) {
      const b = JSON.parse(init.body);
      if (b.start_cursor) return ok({ results: [], has_more: false });
      return ok({
        results: [
          {
            id: "p-1",
            url: "https://notion.so/p1",
            properties: {
              이름: { title: rich("10월 2주차") },
              담당자: { people: [{ id: "u", name: "담당" }] },
              "날짜 ": { date: { start: "2026-10-05", end: "2026-10-09" } },
            },
            created_time: "2026-10-12T00:00:00Z",
            last_edited_time: "2026-10-12T00:00:00Z",
          },
        ],
        has_more: true,
        next_cursor: "page2",
      });
    }
    if (path.startsWith("blocks/p-1/children")) {
      if (!limited) {
        limited = true;
        return new Response("", {
          status: 429,
          headers: { "retry-after": "0" },
        });
      }
      if (path.includes("start_cursor="))
        return ok({
          results: [
            {
              id: "b3",
              type: "paragraph",
              paragraph: { rich_text: rich("후속 검토") },
            },
          ],
          has_more: false,
        });
      return ok({
        results: [
          {
            id: "h",
            type: "heading_3",
            heading_3: { rich_text: rich("월요일") },
          },
          {
            id: "b1",
            type: "bulleted_list_item",
            bulleted_list_item: { rich_text: rich("개발 진행") },
            has_children: true,
          },
        ],
        has_more: true,
        next_cursor: "blocks2",
      });
    }
    if (path.startsWith("blocks/b1/children"))
      return ok({
        results: [
          {
            id: "b2",
            type: "paragraph",
            paragraph: { rich_text: rich("중첩 테스트") },
          },
        ],
        has_more: false,
      });
    throw Error("Unexpected " + path);
  };
  try {
    let result = await syncNotion(db);
    for (let i = 0; result.status !== "success" && i < 20; i++)
      result = await syncNotion(db);
    assert.equal(result.count, 1);
    assert.equal(result.dateProperty, "날짜 ");
    const report = db.list<any>("reports")[0];
    assert.match(report.body, /중첩 테스트/);
    assert.match(report.body, /후속 검토/);
    assert.equal(report.periodConfirmed, true);
    assert.equal(calls.filter((x) => x.endsWith("/query")).length, 2);
    assert.ok(limited);
    const a = db.list<any>("activities")[0];
    db.put("activities", a.id, { ...a, taskId: "fixed", linkConfirmed: true });
    await syncNotion(db);
    let next;
    for (let i = 0; i < 20; i++) {
      next = await syncNotion(db);
      if (next.status === "success") break;
    }
    assert.equal(db.list("reports").length, 1);
    assert.equal(db.get("activities", a.id).taskId, "fixed");
  } finally {
    global.fetch = oldFetch;
    delete process.env.NOTION_TOKEN;
    delete process.env.NOTION_DATA_SOURCE_ID;

    rmSync(dir, { recursive: true, force: true });
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  plan,
  actual,
  dashboard,
  suggestPeriod,
  type Task,
  type Progress,
} from "../server/model.ts";
import { Store } from "../server/store.ts";
import { upsertReport } from "../server/reports.ts";
const t: Task = {
  id: "a",
  product: "P",
  name: "개발",
  owner: "담당",
  sourcePages: [4],
  sourcePrecision: "month",
  sourceStart: "2026-10",
  sourceEnd: "2026-10",
  start: "2026-10-01",
  end: "2026-10-11",
  scheduleConfirmed: true,
  weight: null,
  review: [],
  sourceVersion: "v1.7",
  parentId: null,
};
const progress = (
  value: number,
  date: string,
  kind: "confirmed" | "ai" = "confirmed",
): Progress => ({
  id: date,
  taskId: "a",
  value,
  effectiveDate: date,
  confirmedAt: date + "T01:00:00Z",
  actor: "test",
  note: "verified",
  reportId: null,
  kind,
});
test("계획: 범위, 달력일 선형, 같은 날짜, 미확정", () => {
  assert.equal(plan(t, "2026-09-30"), 0);
  assert.equal(plan(t, "2026-10-06"), 50);
  assert.equal(plan(t, "2026-10-20"), 100);
  assert.equal(plan({ ...t, start: t.end }, t.end), 100);
  assert.equal(plan({ ...t, scheduleConfirmed: false }, t.end), null);
});
test("누적 실제: 미래 제외, AI 제외, 합산 금지, 미입력 null", () => {
  const ps = [
    progress(20, "2026-10-02"),
    progress(40, "2026-10-09"),
    progress(90, "2026-10-16"),
    progress(100, "2026-10-08", "ai"),
  ];
  assert.equal(actual("a", "2026-10-10", ps)?.value, 40);
  assert.equal(actual("a", "2026-09-30", ps), null);
  const b = dashboard([t], ps, "2026-10-10", [], []);
  assert.equal(b.rows[0].actual, 40);
  assert.equal(b.rows[0].change, 20);
  assert.equal(b.summary.actual, 40);
});
test("미확인 0% 제외, 동일 집합 차이, 상하위 중복 제외, 가중치", () => {
  const b = dashboard(
    [
      t,
      { ...t, id: "b", weight: 3 },
      { ...t, id: "parent" },
      { ...t, id: "child", parentId: "parent", scheduleConfirmed: false },
    ],
    [progress(40, "2026-10-02")],
    "2026-10-10",
    [],
    [],
  );
  assert.equal(b.summary.total, 3);
  assert.equal(b.summary.confirmed, 1);
  assert.equal(b.summary.actual, 40);
  assert.ok(Math.abs(b.summary.coverage - 100 / 3) < 1e-9);
  assert.equal(b.summary.pairedCount, 1);
  assert.equal(b.summary.pairedActual, 40);
  assert.equal(b.rows.find((r) => r.id === "b")?.actual, null);
  assert.equal(b.rows[0].carried, true);
});
test("보고 기간은 추정값만 제안", () => {
  assert.equal(suggestPeriod("10월 2주차", 2026).start, "2026-10-05");
  assert.equal(suggestPeriod("9월 2주차 (9/7~9/11)", 2026).end, "2026-09-11");
  assert.equal(suggestPeriod("주간 업무 일지", 2026).start, null);
});
test("반복 수집 중복 방지, 확정 연결/기간 보존, 원문 변경 검토, 재시작 영속", () => {
  const dir = mkdtempSync(join(tmpdir(), "pps-model-"));
  const db = new Store();
  const r = {
    id: "r",
    body: "### 월요일\n- 회의 참석\n- 개발 진행",
    title: "10월 2주차",
    source: "test",
    owner: "test",
    complete: true,
  };
  upsertReport(db, r);
  const a = db.list<any>("activities")[0];
  db.put("activities", a.id, { ...a, taskId: "a", linkConfirmed: true });
  const stored = db.get("reports", "r");
  db.put("reports", "r", {
    ...stored,
    start: "2026-10-05",
    end: "2026-10-09",
    periodConfirmed: true,
  });
  upsertReport(db, r);
  assert.equal(db.list("activities").length, 2);
  assert.equal(db.get("activities", a.id).taskId, "a");
  upsertReport(db, { ...r, body: r.body + "\n- 테스트 완료" });
  assert.equal(db.get("activities", a.id).review, true);
  assert.equal(db.get("reports", "r").periodConfirmed, true);
  assert.equal(db.list("reportRevisions").length, 1);
  upsertReport(db, { ...r, body: "### 월요일\n- 테스트 완료" });
  assert.equal(db.get("activities", a.id).active, false);
  assert.equal(db.get("activities", a.id).taskId, "a");
  const again = new Store(JSON.parse(JSON.stringify(db.records)));
  assert.equal(again.get("activities", a.id).taskId, "a");

  rmSync(dir, { recursive: true, force: true });
});

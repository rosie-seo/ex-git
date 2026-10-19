import { test } from "node:test";
import assert from "node:assert/strict";
import { demoRequest, demoState, isDemoMode } from "../src/demo.ts";
test("Public demo uses only isolated synthetic data and never calls a server", async () => {
  const original = global.fetch;
  global.fetch = async () => {
    throw Error("Public demo must not call a server");
  };
  try {
    assert.equal(isDemoMode("/"), true);
    assert.equal(isDemoMode("/demo"), true);
    assert.equal(isDemoMode("/login"), false);
    assert.equal(isDemoMode("/workspace"), false);
    const session = await demoRequest("/session");
    assert.equal(session.demo, true);
    const state = await demoRequest("/state");
    assert.equal(state.tasks.length, 8);
    assert.ok(state.tasks.every((t: any) => t.id.startsWith("DEMO-")));
    assert.ok(state.reports.every((r: any) => r.url.startsWith("#demo")));
    state.tasks[0].name = "local change";
    assert.notEqual(demoState().tasks[0].name, "local change");
    const board = await demoRequest("/dashboard?end=2026-10-16");
    assert.equal(board.rows.length, 8);
    assert.equal(board.summary.confirmed, 6);
    assert.equal(board.rows[6].actual, null);
    assert.ok(board.rows.some((r: any) => r.delta !== null && r.delta < 0));
    assert.ok(board.rows.some((r: any) => r.evidence.length > 0));
    for (const method of ["POST", "PATCH", "DELETE"])
      await assert.rejects(() => demoRequest("/progress", method), /조회 전용/);
    await assert.rejects(() => demoRequest("/export"), /제공하지 않습니다/);
  } finally {
    global.fetch = original;
  }
});

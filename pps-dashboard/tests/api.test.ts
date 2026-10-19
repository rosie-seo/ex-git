import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { Records } from "../server/store.ts";
const task = {
  id: "task-demo",
  product: "Synthetic product",
  name: "Synthetic implementation",
  owner: "Test owner",
  sourcePages: [1],
  sourcePrecision: "month",
  sourceStart: "2026-10",
  sourceEnd: "2026-10",
  start: "2026-10-01",
  end: "2026-10-31",
  scheduleConfirmed: false,
  weight: null,
  review: [],
  sourceVersion: "demo",
  parentId: null,
};
test("serverless API: auth, Supabase persistence, conflicts, protected files, progress and versions", async () => {
  process.env.NODE_ENV = "test";
  process.env.ADMIN_PASSWORD = randomBytes(24).toString("hex");
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = randomBytes(24).toString("hex");
  let version = 0,
    data: Records = { tasks: { [task.id]: task } },
    conflict = false;
  const realFetch = global.fetch;
  const objects = new Map<string, Uint8Array>();
  global.fetch = async (url: any, init: any = {}) => {
    if (!String(url).startsWith("https://supabase.test"))
      return realFetch(url, init);
    const path = new URL(String(url)).pathname;
    const result = (x: any) =>
      new Response(JSON.stringify(x), {
        headers: { "Content-Type": "application/json" },
      });
    if (path === "/rest/v1/pps_state") return result([{ version, data }]);
    if (path === "/rest/v1/rpc/pps_commit") {
      const b = JSON.parse(init.body);
      if (conflict || b.expected_version !== version) return result(false);
      data = structuredClone(b.payload);
      version++;
      return result(true);
    }
    if (path.startsWith("/storage/v1/object/")) {
      if (init.method === "POST") {
        objects.set(path, init.body);
        return result({ ok: true });
      }
      const value = objects.get(path);
      return value
        ? new Response(value as BodyInit)
        : new Response("", { status: 404 });
    }
    throw Error("Unexpected Supabase path");
  };
  const { app } = await import("../server/index.ts");
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const port = (server.address() as any).port;
  let cookie = "";
  const req = (path: string, method = "GET", body?: object) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        cookie,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  try {
    assert.equal((await req("/api/state")).status, 401);
    assert.equal((await req("/source/wbs-v1.7.pdf")).status, 401);
    const login = await req("/api/login", "POST", {
      user: "admin",
      password: process.env.ADMIN_PASSWORD,
    });
    assert.equal(login.status, 200);
    cookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.match(login.headers.get("set-cookie")!, /HttpOnly/);
    let s = await (await req("/api/state")).json();
    assert.equal(s.tasks.length, 1);
    assert.ok(
      !JSON.stringify(s).includes(process.env.SUPABASE_SERVICE_ROLE_KEY!),
    );
    assert.equal(
      (
        await req("/api/tasks/" + task.id, "PATCH", {
          ...task,
          scheduleConfirmed: true,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await req("/api/baselines", "POST", {
          name: "Test baseline",
          effectiveDate: "2026-10-01",
        })
      ).status,
      200,
    );
    for (const [value, effectiveDate] of [
      [40, "2026-10-09"],
      [90, "2026-10-16"],
    ])
      assert.equal(
        (
          await req("/api/progress", "POST", {
            taskId: task.id,
            value,
            effectiveDate,
            note: "Synthetic verification",
          })
        ).status,
        200,
      );
    const past = await (await req("/api/dashboard?end=2026-10-09")).json();
    assert.equal(past.rows[0].actual, 40);
    conflict = true;
    assert.equal(
      (
        await req("/api/aliases", "POST", {
          from: "Test alias",
          to: "Test owner",
        })
      ).status,
      409,
    );
    conflict = false;
    s = await (await req("/api/state")).json();
    assert.equal(s.aliases.length, 0);
    assert.equal(
      (
        await req("/api/progress", "POST", {
          taskId: task.id,
          value: 101,
          effectiveDate: "2026-10-09",
        })
      ).status,
      400,
    );
    const cross = await fetch(`http://127.0.0.1:${port}/api/progress`, {
      method: "POST",
      headers: {
        cookie,
        origin: "https://wrong.test",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(cross.status, 403);
    await req("/api/logout", "POST", {});
    assert.equal((await req("/api/state")).status, 401);
    // A fresh request observes persisted Supabase state, not process-local SQLite.
    assert.equal(Object.keys(data.progress).length, 2);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal((await req("/api/state")).status, 401);
    const session = await (await req("/api/session")).json();
    assert.equal(session.configured, false);
  } finally {
    global.fetch = realFetch;
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
  }
});

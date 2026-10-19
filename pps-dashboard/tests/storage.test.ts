import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/store.ts";
import {
  loadState,
  commitState,
  uploadFile,
  downloadFile,
} from "../server/supabase.ts";
test("Supabase revision compare-and-swap refuses stale commits and keeps file access server-side", async () => {
  process.env.SUPABASE_URL = "https://storage.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-service-key";
  const old = global.fetch;
  let version = 2,
    records: any = {},
    file: Uint8Array | undefined;
  global.fetch = async (url: any, init: any = {}) => {
    assert.equal(init.headers.Authorization, "Bearer synthetic-service-key");
    if (String(url).includes("/pps_state?"))
      return Response.json([{ version, data: records }]);
    if (String(url).includes("/rpc/pps_commit")) {
      const b = JSON.parse(init.body),
        ok = b.expected_version === version;
      if (ok) {
        version++;
        records = b.payload;
      }
      return Response.json(ok);
    }
    if (init.method === "POST") {
      file = init.body;
      return Response.json({});
    }
    return new Response(file as BodyInit);
  };
  try {
    const a = await loadState(),
      b = await loadState(),
      one = new Store(a.data),
      two = new Store(b.data);
    one.put("tasks", "a", { name: "first" });
    two.put("tasks", "b", { name: "stale" });
    await commitState(a.version, one);
    await assert.rejects(() => commitState(b.version, two), { status: 409 });
    assert.equal(records.tasks.a.name, "first");
    assert.equal(records.tasks.b, undefined);
    await uploadFile("test.pdf", new Uint8Array([1, 2, 3]), "application/pdf");
    assert.deepEqual(
      [...new Uint8Array(await (await downloadFile("test.pdf")).arrayBuffer())],
      [1, 2, 3],
    );
    const fresh = await loadState();
    assert.equal(new Store(fresh.data).get("tasks", "a").name, "first");
  } finally {
    global.fetch = old;
  }
});

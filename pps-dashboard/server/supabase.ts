import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestHandler } from "express";
import { Store, type Records } from "./store.ts";
export const context = new AsyncLocalStorage<Store>();
export const db = new Proxy({} as Store, {
  get(_target, key) {
    const s = context.getStore();
    if (!s) throw Error("Request store unavailable");
    const v = Reflect.get(s, key);
    return typeof v === "function" ? v.bind(s) : v;
  },
});
export const storageConfigured = () =>
  !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
export async function supabase(path: string, init: RequestInit = {}) {
  const origin = process.env.SUPABASE_URL;
  if (!origin || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw Error("Supabase server credentials missing");
  const url = new URL(origin);
  if (url.protocol !== "https:" && process.env.NODE_ENV !== "test")
    throw Error("Supabase HTTPS required");
  const res = await fetch(origin.replace(/\/$/, "") + path, {
    ...init,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
      ...init.headers,
    },
    signal: init.signal || AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const e = Error(
      `Supabase request failed (${res.status}). Check migration and server credentials.`,
    );
    throw e;
  }
  return res;
}
export async function loadState() {
  const res = await supabase(
    "/rest/v1/pps_state?id=eq.workspace&select=version,data",
  );
  const rows = await res.json();
  if (rows.length !== 1) throw Error("Run the Supabase SQL migration first");
  return rows[0] as { version: number; data: Records };
}
export async function commitState(version: number, store: Store) {
  if (!store.dirty) return;
  const res = await supabase("/rest/v1/rpc/pps_commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expected_version: version, payload: store.records }),
  });
  if ((await res.json()) !== true) {
    const error = Object.assign(
      Error("다른 요청이 먼저 저장했습니다. 새로고침 후 다시 시도하세요."),
      { status: 409 },
    );
    throw error;
  }
}
export const unitOfWork: RequestHandler = async (req, res, next) => {
  if (!storageConfigured()) {
    if (req.path === "/api/session") {
      res.json({
        authenticated: false,
        configured: false,
        storageConfigured: false,
        user: process.env.ADMIN_USER || "admin",
      });
      return;
    }
    res
      .status(req.path === "/api/login" ? 503 : 401)
      .json({ error: "서버 Supabase 환경변수와 인증 설정이 필요합니다" });
    return;
  }
  try {
    const state = await loadState(),
      store = new Store(state.data);
    const json = res.json.bind(res);
    let sent = false;
    res.json = ((body: any) => {
      if (sent) return res;
      sent = true;
      void commitState(state.version, store)
        .then(() => json(body))
        .catch((e) => {
          res.removeHeader("Set-Cookie");
          res.status(e.status || 503);
          json({
            error:
              e.status === 409
                ? e.message
                : "데이터 저장 실패. 잠시 후 다시 시도하세요.",
          });
        });
      return res;
    }) as typeof res.json;
    context.run(store, () => next());
  } catch {
    res
      .status(503)
      .json({
        error: "Supabase 연결 실패. 환경변수와 SQL 마이그레이션을 확인하세요.",
      });
  }
};
const bucket = () => process.env.SUPABASE_STORAGE_BUCKET || "pps-private";
const objectPath = (file: string) =>
  `/storage/v1/object/${encodeURIComponent(bucket())}/${file.split("/").map(encodeURIComponent).join("/")}`;
export async function uploadFile(
  file: string,
  bytes: Uint8Array,
  contentType: string,
) {
  await supabase(objectPath(file), {
    method: "POST",
    headers: { "Content-Type": contentType, "x-upsert": "true" },
    body: bytes as BodyInit,
  });
}
export async function downloadFile(file: string) {
  return supabase(objectPath(file));
}

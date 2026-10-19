import express from "express";
import {
  createHash,
  randomBytes,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";

import {
  db,
  unitOfWork,
  storageConfigured,
  uploadFile,
  downloadFile,
} from "./supabase.js";
import { extractPDF } from "./pdf.js";
import {
  dashboard,
  candidates,
  today,
  dateOnly,
  type Task,
  type Report,
  type Activity,
  type Progress,
  type Baseline,
} from "./model.js";
import { upsertReport, hash } from "./reports.js";
import { syncNotion } from "./notion.js";
const root = resolve(import.meta.dirname, ".."),
  app = express();
app.disable("x-powered-by");
if (process.env.VERCEL || process.env.TRUST_PROXY === "1")
  app.set("trust proxy", 1);
const audit = (action: string, data: any) =>
  db.put("audit", randomUUID(), {
    action,
    data,
    at: new Date().toISOString(),
    actor: process.env.ADMIN_USER || "admin",
  });
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  );
  next();
});
app.use(express.json({ limit: "4mb" }));
const configured = () =>
  !!process.env.ADMIN_PASSWORD &&
  process.env.ADMIN_PASSWORD.length >= 12 &&
  !!process.env.SESSION_SECRET &&
  process.env.SESSION_SECRET.length >= 32;
const cookie = (req: express.Request) => {
  const token = req.headers.cookie?.match(/(?:^|; )pps_session=([^;]+)/)?.[1];
  return token ? hash(token + (process.env.SESSION_SECRET || "")) : null;
};
app.use("/api", (req, res, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin &&
    req.headers.origin !== `${req.protocol}://${req.get("host")}`
  ) {
    res.status(403).json({ error: "요청 출처가 다릅니다" });
    return;
  }
  next();
});
app.use((req, res, next) =>
  /^\/(api|source)(\/|$)/.test(req.path) ? unitOfWork(req, res, next) : next(),
);
app.get("/api/session", (req, res) => {
  const key = cookie(req),
    s = key ? db.get("sessions", key) : null;
  res.json({
    authenticated: !!s && s.expires > Date.now(),
    configured: configured() && storageConfigured(),
    user: process.env.ADMIN_USER || "admin",
  });
});
app.post("/api/login", (req, res) => {
  if (!configured()) {
    res.status(503).json({
      error:
        "서버에서 ADMIN_PASSWORD(12자 이상)와 SESSION_SECRET(32자 이상)을 설정하세요",
    });
    return;
  }
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const attemptId = hash(ip);
  let a = db.get<{ n: number; at: number }>("loginAttempts", attemptId);
  if (!a || Date.now() - a.at > 900000) a = { n: 0, at: Date.now() };
  db.put("loginAttempts", attemptId, a);
  if (a.n >= 10) {
    res
      .status(429)
      .json({ error: "로그인 시도 제한. 15분 후 다시 시도하세요" });
    return;
  }
  a.n++;
  db.put("loginAttempts", attemptId, a);
  const eq = (a: string, b: string) =>
    timingSafeEqual(
      createHash("sha256").update(a).digest(),
      createHash("sha256").update(b).digest(),
    );
  if (
    !eq(String(req.body.password || ""), process.env.ADMIN_PASSWORD!) ||
    !eq(String(req.body.user || ""), process.env.ADMIN_USER || "admin")
  ) {
    res.status(401).json({ error: "계정 또는 비밀번호를 확인하세요" });
    return;
  }
  db.remove("loginAttempts", attemptId);
  const token = randomBytes(32).toString("hex");
  db.put("sessions", hash(token + process.env.SESSION_SECRET), {
    expires: Date.now() + 8 * 3600000,
  });
  res.cookie("pps_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production" || !!process.env.VERCEL,
    maxAge: 8 * 3600000,
  });
  res.json({ ok: true });
});
const requireAuth: express.RequestHandler = (req, res, next) => {
  const key = cookie(req),
    s = key ? db.get("sessions", key) : null;
  if (!configured() || !s || s.expires < Date.now()) {
    res.status(401).json({ error: "로그인이 필요합니다" });
    return;
  }
  next();
};
app.use("/api", requireAuth);
app.use("/source", requireAuth);
app.post("/api/logout", (req, res) => {
  const key = cookie(req);
  if (key) db.remove("sessions", key);
  res.clearCookie("pps_session");
  res.json({ ok: true });
});
app.get("/api/state", (req, res) => {
  res.json({
    tasks: db.list("tasks"),
    reports: db.list("reports"),
    activities: db.list("activities"),
    progress: db.list("progress"),
    baselines: db.list("baselines"),
    documents: db.list("documents"),
    aliases: db.list("aliases"),
    sync: db.get("sync", "current") || db.get("sync", "snapshot"),
    notionConfigured: !!process.env.NOTION_TOKEN,
    today: today(),
  });
});
app.get("/api/dashboard", (req, res) => {
  const end = String(req.query.end || today());
  if (!dateOnly(end)) {
    res.status(400).json({ error: "기준일 형식 오류" });
    return;
  }
  const baselines = db
    .list<Baseline>("baselines")
    .filter((b) => b.effectiveDate <= end)
    .sort(
      (a, b) =>
        b.effectiveDate.localeCompare(a.effectiveDate) ||
        b.confirmedAt.localeCompare(a.confirmedAt),
    );
  const tasks =
    baselines[0]?.tasks ||
    db.list<Task>("tasks").map((t) => ({ ...t, scheduleConfirmed: false }));
  res.json({
    ...dashboard(
      tasks,
      db.list<Progress>("progress"),
      end,
      db.list<Activity>("activities"),
      db.list<Report>("reports"),
    ),
    baseline: baselines[0] || null,
  });
});
app.patch("/api/tasks/:id", (req, res) => {
  const t = db.get<Task>("tasks", String(req.params.id));
  if (!t) {
    res.status(404).json({ error: "업무 없음" });
    return;
  }
  const b = req.body;
  if (
    !b.name ||
    !b.product ||
    !dateOnly(b.start) ||
    !dateOnly(b.end) ||
    b.end < b.start ||
    (b.weight !== null &&
      (!(Number(b.weight) > 0) || !Number.isFinite(Number(b.weight))))
  ) {
    res
      .status(400)
      .json({ error: "업무명·제품·유효한 날짜·양수 가중치를 확인하세요" });
    return;
  }
  const next = {
    ...t,
    name: String(b.name),
    product: String(b.product),
    owner: String(b.owner || ""),
    start: b.start,
    end: b.end,
    weight: b.weight === null ? null : Number(b.weight),
    scheduleConfirmed: !!b.scheduleConfirmed,
    review: Array.isArray(b.review) ? b.review.map(String) : t.review,
  };
  db.transaction(() => {
    db.put("tasks", t.id, next);
    audit("task.update", { before: t, after: next });
  });
  res.json(next);
});
app.post("/api/baselines", (req, res) => {
  const tasks = db.list<Task>("tasks");
  if (!req.body.name || !dateOnly(req.body.effectiveDate) || !tasks.length) {
    res.status(400).json({ error: "기준 버전명과 적용일을 입력하세요" });
    return;
  }
  const b = {
    id: randomUUID(),
    name: String(req.body.name),
    effectiveDate: req.body.effectiveDate,
    confirmedAt: new Date().toISOString(),
    tasks,
  };
  db.put("baselines", b.id, b);
  audit("baseline.confirm", { id: b.id });
  res.json(b);
});
app.post("/api/aliases", (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) {
    res.status(400).json({ error: "원문 이름과 연결할 이름을 입력하세요" });
    return;
  }
  db.put("aliases", String(from), {
    from: String(from),
    to: String(to),
    confirmedAt: new Date().toISOString(),
  });
  audit("alias.confirm", { from, to });
  res.json({ ok: true });
});
app.get("/api/candidates/:id", (req, res) => {
  const a = db.get<Activity>("activities", String(req.params.id));
  if (!a) {
    res.status(404).json({ error: "활동 없음" });
    return;
  }
  const r = db.get<Report>("reports", a.reportId)!;
  res.json(
    candidates(
      a,
      r,
      db.list("tasks"),
      Object.fromEntries(db.list<any>("aliases").map((x) => [x.from, x.to])),
    ),
  );
});
app.patch("/api/activities/:id", (req, res) => {
  const a = db.get<Activity>("activities", String(req.params.id));
  if (!a) {
    res.status(404).json({ error: "활동 없음" });
    return;
  }
  const { taskId, outside, relatedTaskIds = [] } = req.body;
  if (!outside && !db.get("tasks", taskId)) {
    res.status(400).json({ error: "대표 WBS 업무를 선택하세요" });
    return;
  }
  if (
    !Array.isArray(relatedTaskIds) ||
    relatedTaskIds.some((id) => !db.get("tasks", id))
  ) {
    res.status(400).json({ error: "관련 업무 오류" });
    return;
  }
  const next = {
    ...a,
    taskId: outside ? null : taskId,
    outside: !!outside,
    relatedTaskIds: [...new Set<string>(relatedTaskIds)].filter(
      (id) => id !== taskId,
    ),
    linkConfirmed: true,
    review: false,
  };
  db.put("activities", a.id, next);
  audit("activity.confirm", { before: a, after: next });
  res.json(next);
});
app.patch("/api/reports/:id", (req, res) => {
  const r = db.get<Report>("reports", String(req.params.id));
  if (!r) {
    res.status(404).json({ error: "보고 없음" });
    return;
  }
  const { start, end } = req.body;
  if (!dateOnly(start) || !dateOnly(end) || end < start) {
    res.status(400).json({ error: "보고 시작일·종료일 확인 필요" });
    return;
  }
  const next = {
    ...r,
    start,
    end,
    periodConfirmed: true,
    periodReason: "사용자 확인",
    changed: false,
  };
  db.put("reports", r.id, next);
  audit("report.period", { before: r, after: next });
  res.json(next);
});
app.post("/api/progress", (req, res) => {
  const { taskId, value, effectiveDate, note = "", reportId = null } = req.body;
  const r = reportId ? db.get<Report>("reports", reportId) : null;
  if (
    !db.get("tasks", taskId) ||
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100 ||
    !dateOnly(effectiveDate) ||
    effectiveDate > today()
  ) {
    res
      .status(400)
      .json({ error: "업무·0~100 누적 수치·오늘 이전 기준일을 확인하세요" });
    return;
  }
  if (reportId && (!r?.periodConfirmed || r.end! > effectiveDate)) {
    res.status(400).json({
      error:
        "보고 기간을 먼저 확정하고, 보고 종료일 이후 진척률 기준일을 선택하세요",
    });
    return;
  }
  const p: Progress = {
    id: randomUUID(),
    taskId,
    value,
    effectiveDate,
    confirmedAt: new Date().toISOString(),
    actor: process.env.ADMIN_USER || "admin",
    note: String(note),
    reportId,
    kind: "confirmed",
  };
  db.put("progress", p.id, p);
  audit("progress.confirm", p);
  res.json(p);
});
app.post("/api/sync", async (req, res) => {
  if (!process.env.NOTION_TOKEN) {
    res.status(503).json({ error: "운영용 NOTION_TOKEN 미설정" });
    return;
  }
  try {
    const result = await syncNotion(db);
    res.json(result);
  } catch (e) {
    db.put("sync", "current", {
      ...db.get("sync", "current"),
      status: "error",
      at: new Date().toISOString(),
      error: (e as Error).message,
    });
    res
      .status(502)
      .json({
        error: "노션 수집 실패. 상태와 권한을 확인하고 다시 시도하세요.",
      });
  }
});
app.post("/api/snapshot/reimport", (req, res) => {
  let count = 0;
  for (const r of db.list<any>("seedReports")) {
    upsertReport(db, r);
    count++;
  }
  res.json({ count });
});
app.post("/api/pdf", async (req, res) => {
  const { name, base64 } = req.body;
  if (!name || !base64) {
    res.status(400).json({ error: "PDF 파일 필요" });
    return;
  }
  const bytes = Buffer.from(base64, "base64");
  if (
    !bytes.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
    bytes.length > 2.5 * 1024 * 1024
  ) {
    res
      .status(400)
      .json({
        error:
          "서버 함수 업로드는 2.5MB 이하입니다. 큰 PDF는 비공개 데이터 이관 도구로 올리세요.",
      });
    return;
  }
  const id = hash(bytes.toString("base64")).slice(0, 20),
    file = id + ".pdf";
  try {
    const data = await extractPDF(bytes, id);
    await uploadFile(file, bytes, "application/pdf");
    db.put("documents", id, {
      id,
      name: String(name),
      file,
      pages: data.pages,
      source: "업로드 PDF",
      importedAt: new Date().toISOString(),
    });
    res.json({ ...data, documentId: id });
  } catch {
    res
      .status(422)
      .json({
        error:
          "PDF 추출/보관 실패. 텍스트 PDF 및 Supabase Storage 설정을 확인하세요.",
      });
  }
});
app.post("/api/import/tasks", (req, res) => {
  if (!Array.isArray(req.body.tasks)) {
    res.status(400).json({ error: "업무 배열 필요" });
    return;
  }
  const tasks = req.body.tasks as any[];
  if (
    tasks.length > 500 ||
    tasks.some(
      (t) =>
        !t.product ||
        !t.name ||
        !Array.isArray(t.sourcePages) ||
        !db.get("documents", t.sourceVersion) ||
        (t.targetId && !db.get("tasks", t.targetId)),
    )
  ) {
    res.status(400).json({
      error: "제품·업무명·페이지·원본 버전·기존 업무 대응을 확인하세요",
    });
    return;
  }
  if (
    new Set(tasks.filter((t) => t.targetId).map((t) => t.targetId)).size !==
    tasks.filter((t) => t.targetId).length
  ) {
    res.status(400).json({
      error:
        "동일 기존 업무에 여러 행을 대응했습니다. 연속 페이지를 검토해 한 행으로 반영하세요.",
    });
    return;
  }
  db.transaction(() => {
    for (const input of tasks) {
      const id = input.targetId || randomUUID();
      const old = db.get<Task>("tasks", id);
      if (old) db.put("taskRevisions", id + ":" + randomUUID(), old);
      db.put("tasks", id, {
        ...input,
        id,
        start: input.start || "",
        end: input.end || "",
        scheduleConfirmed: false,
        weight: old?.weight ?? null,
        parentId: null,
        review: ["새 PDF 추출 결과: 원문·일정·업무 대응 검토 필요"],
        sourcePrecision: "month",
        owner: input.owner || "",
      });
    }
    audit("pdf.import", { count: tasks.length });
  });
  res.json({ count: tasks.length });
});
app.get("/api/export", (req, res) => {
  res.attachment("pps-backup.json").json({
    exportedAt: new Date().toISOString(),
    tasks: db.list("tasks"),
    reports: db.list("reports"),
    activities: db.list("activities"),
    progress: db.list("progress"),
    baselines: db.list("baselines"),
    aliases: db.list("aliases"),
    audit: db.list("audit"),
  });
});
app.get("/source/:file", async (req, res) => {
  const file = String(req.params.file);
  if (!/^(page-\d+\.png|wbs-v1\.7\.pdf|[a-f0-9]{20}\.pdf)$/.test(file)) {
    res.sendStatus(404);
    return;
  }
  try {
    const fileRes = await downloadFile(file);
    res.type(file.endsWith(".pdf") ? "application/pdf" : "image/png");
    res.send(Buffer.from(await fileRes.arrayBuffer()));
  } catch {
    res
      .status(404)
      .json({
        error: "비공개 파일이 없습니다. 원본 데이터 이관을 확인하세요.",
      });
  }
});
app.use(["/api", "/source"], (_req,res)=>{res.status(404).json({error:"API 경로를 찾을 수 없습니다."})});
app.use(express.static(join(root, "dist"), { index: false }));
app.get("/", (req, res) => {
  const f = join(root, "dist/index.html");
  if (existsSync(f)) res.sendFile(f);
  else res.status(503).send("먼저 npm run build를 실행하세요");
});
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("요청 실패:", err.code || err.name);
    res.status(err.status || 500).json({
      error:
        err.status === 413
          ? "파일 크기 초과"
          : "요청 처리 실패. 입력값과 서버 설정을 확인하세요",
    });
  },
);
export { app, db };
if (process.env.NODE_ENV !== "test" && !process.env.VERCEL) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, process.env.HOST || "127.0.0.1", () =>
    console.log(
      `PPS dashboard: http://${process.env.HOST || "127.0.0.1"}:${port} (로그인 ${configured() ? "설정됨" : "환경변수 설정 필요"})`,
    ),
  );
}

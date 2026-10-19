export interface Task {
  sourceRows?: { page: number; name: string }[];
  id: string;
  product: string;
  name: string;
  owner: string;
  sourcePages: number[];
  sourcePrecision: string;
  sourceStart: string;
  sourceEnd: string;
  start: string;
  end: string;
  scheduleConfirmed: boolean;
  weight: number | null;
  review: string[];
  sourceVersion: string;
  parentId: string | null;
}
export interface Report {
  rawBlocks?: unknown[];
  sourceHash?: string;
  id: string;
  title: string;
  url: string;
  body: string;
  owner: string;
  ownerIds: string[];
  start: string | null;
  end: string | null;
  suggestedStart: string | null;
  suggestedEnd: string | null;
  periodConfirmed: boolean;
  periodReason: string;
  lastEdited: string;
  complete: boolean;
  changed: boolean;
  hash: string;
  source: string;
}
export interface Activity {
  id: string;
  reportId: string;
  text: string;
  day: string;
  taskId: string | null;
  relatedTaskIds: string[];
  linkConfirmed: boolean;
  outside: boolean;
  review: boolean;
  active: boolean;
}
export interface Progress {
  id: string;
  taskId: string;
  value: number;
  effectiveDate: string;
  confirmedAt: string;
  actor: string;
  note: string;
  reportId: string | null;
  kind: "confirmed" | "ai";
}
export interface Baseline {
  id: string;
  name: string;
  effectiveDate: string;
  confirmedAt: string;
  tasks: Task[];
}
export const dateOnly = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
export const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(
    new Date(),
  );
export function shift(s: string, days: number) {
  return new Date(Date.parse(s + "T00:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function plan(t: Task, end: string): number | null {
  if (
    !t.scheduleConfirmed ||
    !dateOnly(t.start) ||
    !dateOnly(t.end) ||
    t.end < t.start
  )
    return null;
  if (end < t.start) return 0;
  if (end >= t.end) return 100;
  return (
    ((Date.parse(end) - Date.parse(t.start)) /
      (Date.parse(t.end) - Date.parse(t.start))) *
    100
  );
}
export function actual(taskId: string, end: string, ps: Progress[]) {
  return (
    ps
      .filter(
        (p) =>
          p.taskId === taskId &&
          p.kind === "confirmed" &&
          p.effectiveDate <= end,
      )
      .sort(
        (a, b) =>
          b.effectiveDate.localeCompare(a.effectiveDate) ||
          b.confirmedAt.localeCompare(a.confirmedAt),
      )[0] || null
  );
}
export function dashboard(
  tasks: Task[],
  progress: Progress[],
  end: string,
  activities: Activity[],
  reports: Report[],
) {
  const leaves = tasks.filter((t) => !tasks.some((c) => c.parentId === t.id));
  const rows = leaves.map((t) => {
    const p = plan(t, end),
      a = actual(t.id, end, progress),
      prev = actual(t.id, shift(end, -7), progress);
    const evidence = activities
      .filter(
        (x) => x.active && x.taskId === t.id && x.linkConfirmed && !x.review,
      )
      .filter((x) => {
        const r = reports.find((r) => r.id === x.reportId);
        return r?.periodConfirmed && r.end! <= end && r.end! > shift(end, -7);
      });
    return {
      ...t,
      planned: p,
      actual: a?.value ?? null,
      lastConfirmed: a?.effectiveDate ?? null,
      carried: !!a && a.effectiveDate <= shift(end, -7),
      delta: p !== null && a ? a.value - p : null,
      change: a && prev ? a.value - prev.value : null,
      state:
        p !== null && a
          ? a.value < p
            ? "계획 미달"
            : a.value === 100
              ? "완료"
              : "계획 충족"
          : "확인 필요",
      evidence: evidence.map((x) => ({
        ...x,
        report: reports.find((r) => r.id === x.reportId),
      })),
    };
  });
  const weighted = (rs: typeof rows, key: "planned" | "actual") => {
    const selected = rs.filter((r) => r[key] !== null);
    const weight = selected.reduce((s, r) => s + (r.weight ?? 1), 0);
    return weight
      ? selected.reduce((s, r) => s + (r[key] ?? 0) * (r.weight ?? 1), 0) /
          weight
      : null;
  };
  const confirmed = rows.filter((r) => r.actual !== null),
    paired = rows.filter((r) => r.actual !== null && r.planned !== null);
  return {
    rows,
    summary: {
      planned: weighted(rows, "planned"),
      actual: weighted(confirmed, "actual"),
      coverage: rows.length ? (confirmed.length / rows.length) * 100 : 0,
      pairedPlanned: weighted(paired, "planned"),
      pairedActual: weighted(paired, "actual"),
      pairedDelta: paired.length
        ? weighted(paired, "actual")! - weighted(paired, "planned")!
        : null,
      pairedCount: paired.length,
      total: rows.length,
      confirmed: confirmed.length,
      below: rows.filter((r) => r.delta !== null && r.delta < 0).length,
      equalWeight: rows.some((r) => r.weight === null),
    },
  };
}
export function suggestPeriod(title: string, year: number) {
  const m = title.match(
    /(\d{1,2})\/(\d{1,2})\s*[\\~～–-]+\s*(\d{1,2})\/(\d{1,2})/,
  );
  if (m) {
    const start = `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`,
      end = `${year + (+m[3] < +m[1] ? 1 : 0)}-${m[3].padStart(2, "0")}-${m[4].padStart(2, "0")}`;
    return {
      start,
      end,
      reason: "제목의 월/일과 생성 연도의 조합 가정. 확정 필요",
    };
  }
  const w = title.match(/(\d{1,2})월\s*(\d+)주차/);
  if (!w)
    return {
      start: null,
      end: null,
      reason: "보고 기간 근거 부족. 수동 입력 필요",
    };
  const first = `${year}-${w[1].padStart(2, "0")}-01`;
  const wd = new Date(first + "T00:00:00Z").getUTCDay();
  const start = shift(first, (wd === 0 ? -6 : 1 - wd) + (+w[2] - 1) * 7);
  return {
    start,
    end: shift(start, 4),
    reason: "월 1일이 포함된 월~금 기준 제안. 제목/생성일로 확정하지 않음",
  };
}
export function splitActivities(body: string) {
  let day = "",
    inside = false;
  const out: { text: string; day: string }[] = [];
  for (const raw of body.split("\n")) {
    const s = raw.trim();
    if (/^#{1,6}\s.*[월화수목금토일]요일/.test(s)) {
      day = s.replace(/^#+\s*/, "");
      inside = true;
      continue;
    }
    if (/^#{1,4}\s/.test(s) && !s.includes("요일")) {
      inside = false;
      continue;
    }
    if (!inside) continue;
    const text = s
      .replace(/<[^>]+>/g, "")
      .replace(/^[-*\d.)]+\s*/, "")
      .replace(/\*\*|`/g, "")
      .trim();
    if (text.length < 3 || /^[-=]+$/.test(text) || /^!\[/.test(text)) continue;
    out.push({ text, day });
  }
  return out;
}
export function candidates(
  a: Activity,
  r: Report,
  tasks: Task[],
  aliases: Record<string, string>,
) {
  const text = a.text.toLowerCase();
  const families: [string, string[]][] = [
    ["ADAPTER", ["adapter", "어댑터", "어뎁터", "cdc", "debezium"]],
    ["AGENT", ["agent", "에이전트"]],
    ["PIPELINE", ["pipeline", "파이프라인", "토픽", "컨슈머"]],
    ["업무 AI", ["업무ai", "업무 ai", "목표관리"]],
    ["GOLD", ["gold", "컨설팅"]],
    ["GATEWAY", ["gateway", "게이트웨이"]],
  ];
  return tasks
    .map((t) => {
      let score = 0;
      const reasons: string[] = [];
      for (const [p, keys] of families)
        if (
          (t.product.toUpperCase().includes(p.toUpperCase()) ||
            (p === "PIPELINE" && t.product.includes("파이프라인"))) &&
          keys.some((k) => text.includes(k))
        ) {
          score += 4;
          reasons.push("제품 키워드 일치");
        }
      const owner = aliases[r.owner] || r.owner;
      if (owner && t.owner.includes(owner)) {
        score += 3;
        reasons.push("담당자 일치 (확정 별칭 적용)");
      }
      for (const k of [
        "설계",
        "기획",
        "테스트",
        "qa",
        "design",
        "publishing",
        "front",
        "back",
        "engine",
        "개발",
        "시연",
        "helm",
        "아키텍처",
      ])
        if (text.includes(k) && t.name.toLowerCase().includes(k)) {
          score++;
          reasons.push(`업무 키워드: ${k}`);
        }
      if (
        r.periodConfirmed &&
        r.start &&
        r.end &&
        r.start <= t.end &&
        r.end >= t.start
      ) {
        score++;
        reasons.push("제안 일정과 기간 겹침");
      }
      return { taskId: t.id, score, reasons };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

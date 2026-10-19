import {
  dashboard,
  candidates,
  type Task,
  type Report,
  type Activity,
  type Progress,
} from "../server/model";
/** Public fixtures only. No database, Notion ID, person, document or API token is read here. */
export const demoNotice =
  "데모 데이터 · 모든 제품·담당자·보고·진척률은 화면 확인용 가상 자료입니다. 변경은 저장되지 않습니다.";
export function isDemoMode(
  path = typeof window === "undefined" ? "/" : window.location.pathname,
) {
  return !["/login", "/workspace"].includes(path.replace(/\/$/, "") || "/");
}
const names = [
  "요구사항 및 화면 설계",
  "수집 모듈 개발",
  "연동 API 구현",
  "사용자 화면 개발",
  "통합 테스트",
  "배포 및 운영 준비",
  "검색 기능 설계",
  "품질 검증",
];
const tasks: Task[] = names.map((name, i) => ({
  id: `DEMO-${String(i + 1).padStart(2, "0")}`,
  product:
    i < 3
      ? "[데모] 데이터 연동"
      : i < 6
        ? "[데모] 업무 포털"
        : "[데모] 검색 서비스",
  name,
  owner: `담당자 ${["A", "B", "C"][i % 3]}`,
  sourcePages: [1],
  sourcePrecision: "month",
  sourceStart: "2026-10",
  sourceEnd: "2026-10",
  start: i === 4 ? "2026-10-15" : "2026-10-01",
  end: i === 0 ? "2026-10-12" : "2026-10-31",
  scheduleConfirmed: i !== 7,
  weight: null,
  review: i === 7 ? ["데모: 계획 일정 확인 필요"] : [],
  sourceVersion: "demo",
  parentId: null,
}));
const reports: Report[] = [
  {
    id: "demo-report-a",
    title: "[데모] 10월 3주차 업무보고",
    url: "#demo-report-a",
    body: "### 월요일\n- 수집 모듈의 오류 처리를 구현했습니다.\n### 화요일\n- 연동 API 테스트 항목을 정리했습니다.\n### 수요일\n- 사용자 화면과 검색 필터를 구현했습니다.\n### 목요일\n- 통합 테스트 결과를 검토했습니다.",
    owner: "담당자 A",
    ownerIds: [],
    start: "2026-10-12",
    end: "2026-10-16",
    suggestedStart: null,
    suggestedEnd: null,
    periodConfirmed: true,
    periodReason: "가상 자료",
    lastEdited: "2026-10-16T08:00:00Z",
    complete: true,
    changed: false,
    hash: "demo-a",
    source: "데모 데이터",
  },
  {
    id: "demo-report-b",
    title: "[데모] 기간 확인이 필요한 보고",
    url: "#demo-report-b",
    body: "### 월요일\n- 운영 준비 항목을 검토했습니다.\n### 화요일\n- 추가 요청을 정리했습니다.",
    owner: "담당자 B",
    ownerIds: [],
    start: null,
    end: null,
    suggestedStart: "2026-10-12",
    suggestedEnd: "2026-10-16",
    periodConfirmed: false,
    periodReason: "가상 자료: 사용자가 제안 기간을 확인하는 화면 예시",
    lastEdited: "2026-10-16T07:00:00Z",
    complete: true,
    changed: false,
    hash: "demo-b",
    source: "데모 데이터",
  },
];
const activities: Activity[] = [
  "수집 모듈의 오류 처리를 구현했습니다.",
  "연동 API 테스트 항목을 정리했습니다.",
  "사용자 화면과 검색 필터를 구현했습니다.",
  "통합 테스트 결과를 검토했습니다.",
  "운영 준비 항목을 검토했습니다.",
  "추가 요청을 정리했습니다.",
].map((text, i) => ({
  id: "demo-activity-" + i,
  reportId: i < 4 ? "demo-report-a" : "demo-report-b",
  text,
  day: ["월요일", "화요일", "수요일", "목요일", "월요일", "화요일"][i],
  taskId: i < 4 ? tasks[i + 1].id : null,
  relatedTaskIds: [],
  linkConfirmed: i < 4,
  outside: false,
  review: false,
  active: true,
}));
const progress: Progress[] = [];
for (const [i, value] of [100, 65, 30, 70, 10, 0].entries()) {
  for (const [week, v] of [
    ["2026-10-09", Math.max(0, value - 20)],
    ["2026-10-16", value],
  ] as const)
    progress.push({
      id: `demo-progress-${i}-${week}`,
      taskId: tasks[i].id,
      value: v,
      effectiveDate: week,
      confirmedAt: week + "T08:00:00Z",
      actor: "데모 담당자",
      note: "화면 확인을 위한 가상 누적 진척률입니다.",
      reportId: null,
      kind: "confirmed",
    });
}
export function demoState() {
  return structuredClone({
    tasks,
    reports,
    activities,
    progress,
    baselines: [
      {
        id: "demo-baseline",
        name: "[데모] 화면 확인 기준",
        effectiveDate: "2026-10-01",
        confirmedAt: "2026-10-01T00:00:00Z",
        tasks,
      },
    ],
    documents: [],
    aliases: [],
    sync: { status: "demo", at: "2026-10-16T08:00:00Z", scope: demoNotice },
    notionConfigured: false,
    today: "2026-10-19",
    demo: true,
  });
}
export async function demoRequest(path: string, method = "GET"): Promise<any> {
  if (method !== "GET")
    throw Error("데모는 조회 전용입니다. 실제 작업은 로그인 후 이용하세요.");
  const url = new URL(path, "https://demo.invalid");
  if (url.pathname === "/session")
    return {
      authenticated: true,
      demo: true,
      configured: false,
      user: "데모 방문자",
    };
  if (url.pathname === "/state") return demoState();
  if (url.pathname === "/dashboard") {
    const s = demoState();
    return {
      ...dashboard(
        s.tasks,
        s.progress,
        url.searchParams.get("end") || "2026-10-16",
        s.activities,
        s.reports,
      ),
      baseline: s.baselines[0],
    };
  }
  if (url.pathname.startsWith("/candidates/")) {
    const id = decodeURIComponent(url.pathname.slice("/candidates/".length)),
      a = activities.find((a) => a.id === id);
    return a
      ? candidates(
          a,
          reports.find((r) => r.id === a.reportId)!,
          tasks,
          {},
        )
      : [];
  }
  throw Error(
    "이 기능은 데모에서 제공하지 않습니다. 실제 워크스페이스에 로그인하세요.",
  );
}
